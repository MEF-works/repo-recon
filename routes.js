import { existsSync, readdirSync, readFileSync } from 'fs';
import { join, relative, extname, basename } from 'path';

// High-value routes to always check even without discovery
const UNIVERSAL_ROUTES = ['/', '/about', '/contact', '/login', '/register', '/dashboard'];

// E-commerce specific
const ECOM_ROUTES = ['/shop', '/products', '/cart', '/checkout', '/account', '/orders'];

// Marketing / content
const CONTENT_ROUTES = ['/pricing', '/blog', '/faq', '/terms', '/privacy'];

const PAGE_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx', '.vue', '.svelte'];

export async function discoverRoutes(baseUrl, framework, cwd = process.cwd()) {
  const discovered = new Set();
  
  // Framework-specific file-based routing
  const fileRoutes = discoverFileRoutes(framework, cwd);
  fileRoutes.forEach(r => discovered.add(r));

  // Always probe universal + ecom routes - filter to ones that respond 200
  const candidates = [...new Set([
    ...UNIVERSAL_ROUTES,
    ...ECOM_ROUTES,
    ...CONTENT_ROUTES,
    ...fileRoutes,
  ])];

  const verified = await probeRoutes(baseUrl, candidates);
  verified.forEach(r => discovered.add(r));

  // Deduplicate and sort — root first, then by path depth
  return [...discovered]
    .filter(Boolean)
    .sort((a, b) => {
      if (a === '/') return -1;
      if (b === '/') return 1;
      return a.split('/').length - b.split('/').length || a.localeCompare(b);
    })
    .slice(0, 20); // Cap at 20 pages — context packet not a full crawl
}

function discoverFileRoutes(framework, cwd) {
  const routes = [];

  if (framework === 'next.js') {
    // App router
    const appDir = join(cwd, 'app');
    if (existsSync(appDir)) {
      routes.push(...scanNextAppDir(appDir, cwd));
    }
    // Pages router
    const pagesDir = join(cwd, 'pages');
    if (existsSync(pagesDir)) {
      routes.push(...scanNextPagesDir(pagesDir, cwd));
    }
  }

  if (['vite', 'create-react-app'].includes(framework)) {
    // Best-effort — scan for router definitions
    routes.push(...scanReactRouterConfig(cwd));
  }

  if (framework === 'nuxt') {
    const pagesDir = join(cwd, 'pages');
    if (existsSync(pagesDir)) {
      routes.push(...scanGenericPagesDir(pagesDir, cwd));
    }
  }

  if (framework === 'sveltekit') {
    const routesDir = join(cwd, 'src/routes');
    if (existsSync(routesDir)) {
      routes.push(...scanSvelteKitRoutes(routesDir, cwd));
    }
  }

  return routes;
}

function scanNextAppDir(dir, cwd, prefix = '') {
  const routes = [];
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return []; }

  for (const entry of entries) {
    if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue;
    
    if (entry.isDirectory()) {
      const segment = entry.name.replace(/^\(.*?\)$/, ''); // strip route groups
      const nextPrefix = segment ? `${prefix}/${segment}` : prefix;
      routes.push(...scanNextAppDir(join(dir, entry.name), cwd, nextPrefix));
    } else if (entry.name === 'page.js' || entry.name === 'page.tsx' || entry.name === 'page.jsx') {
      routes.push(prefix || '/');
    }
  }
  return routes;
}

function scanNextPagesDir(dir, cwd, prefix = '') {
  const routes = [];
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return []; }

  for (const entry of entries) {
    if (entry.name.startsWith('_') || entry.name.startsWith('.')) continue;
    
    const ext = extname(entry.name);
    const name = basename(entry.name, ext);
    
    if (entry.isDirectory()) {
      routes.push(...scanNextPagesDir(join(dir, entry.name), cwd, `${prefix}/${entry.name}`));
    } else if (PAGE_EXTENSIONS.includes(ext)) {
      if (name === 'index') {
        routes.push(prefix || '/');
      } else if (!name.startsWith('[')) { // Skip dynamic routes
        routes.push(`${prefix}/${name}`);
      }
    }
  }
  return routes;
}

function scanSvelteKitRoutes(dir, cwd, prefix = '') {
  const routes = [];
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return []; }

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    if (entry.isDirectory()) {
      const seg = entry.name.replace(/^\(.*?\)$/, '').replace(/^\[.*?\]$/, '');
      if (seg) routes.push(...scanSvelteKitRoutes(join(dir, entry.name), cwd, `${prefix}/${seg}`));
    } else if (entry.name === '+page.svelte') {
      routes.push(prefix || '/');
    }
  }
  return routes;
}

function scanGenericPagesDir(dir, cwd) {
  const routes = [];
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return []; }

  for (const entry of entries) {
    const ext = extname(entry.name);
    const name = basename(entry.name, ext);
    if (entry.isDirectory()) {
      routes.push(`/${entry.name}`);
    } else if (PAGE_EXTENSIONS.includes(ext)) {
      routes.push(name === 'index' ? '/' : `/${name}`);
    }
  }
  return routes;
}

function scanReactRouterConfig(cwd) {
  // Light grep for path= patterns in App.js / router files
  const candidates = ['src/App.jsx', 'src/App.tsx', 'src/App.js', 'src/router.js', 'src/routes.js'];
  const routes = [];
  
  for (const f of candidates) {
    const fpath = join(cwd, f);
    if (!existsSync(fpath)) continue;
    try {
      const content = readFileSync(fpath, 'utf8');
      const matches = content.matchAll(/path=["']([^"':*]+)["']/g);
      for (const m of matches) {
        if (!m[1].includes(':') && !m[1].includes('*')) {
          routes.push(m[1].startsWith('/') ? m[1] : `/${m[1]}`);
        }
      }
    } catch {}
  }
  return routes;
}

async function probeRoutes(baseUrl, routes) {
  const verified = [];
  
  await Promise.allSettled(
    routes.map(async (route) => {
      try {
        const res = await fetch(`${baseUrl}${route}`, {
          method: 'HEAD',
          signal: AbortSignal.timeout(2000),
        });
        if (res.ok || res.status === 200) {
          verified.push(route);
        }
      } catch {
        // Route not available — skip
      }
    })
  );

  return verified;
}
