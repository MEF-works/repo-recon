import { readFileSync, existsSync } from 'fs';
import { resolve, join } from 'path';
import net from 'net';

const COMMON_PORTS = [3000, 3001, 4000, 4200, 5000, 5173, 8000, 8080, 8888, 9000];

const FRAMEWORK_SIGNATURES = {
  'next.js':       (pkg) => !!pkg.dependencies?.next || !!pkg.devDependencies?.next,
  'nuxt':          (pkg) => !!pkg.dependencies?.nuxt || !!pkg.devDependencies?.nuxt,
  'vite':          (pkg) => !!pkg.devDependencies?.vite,
  'create-react-app': (pkg) => !!pkg.dependencies?.['react-scripts'],
  'remix':         (pkg) => !!pkg.dependencies?.['@remix-run/react'],
  'sveltekit':     (pkg) => !!pkg.dependencies?.['@sveltejs/kit'],
  'astro':         (pkg) => !!pkg.dependencies?.astro || !!pkg.devDependencies?.astro,
  'gatsby':        (pkg) => !!pkg.dependencies?.gatsby,
  'express':       (pkg) => !!pkg.dependencies?.express,
  'fastify':       (pkg) => !!pkg.dependencies?.fastify,
  'wordpress':     () => existsSync('wp-config.php') || existsSync('wp-config-sample.php'),
  'laravel':       () => existsSync('artisan'),
  'django':        () => existsSync('manage.py'),
  'rails':         () => existsSync('Gemfile') && existsSync('config/routes.rb'),
};

export async function detectPort() {
  // 1. Check docker-compose for exposed ports
  const dockerPort = readDockerComposePort();
  if (dockerPort) return dockerPort;

  // 2. Check .env files
  const envPort = readEnvPort();
  if (envPort) return envPort;

  // 3. Check package.json scripts for --port flags
  const scriptPort = readPackageScriptPort();
  if (scriptPort) return scriptPort;

  // 4. Scan common ports for something actually listening
  const activePort = await scanPorts(COMMON_PORTS);
  if (activePort) return activePort;

  return null;
}

export function detectFramework(cwd = process.cwd()) {
  let pkg = {};
  const pkgPath = join(cwd, 'package.json');
  
  if (existsSync(pkgPath)) {
    try {
      pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    } catch {}
  }

  for (const [name, check] of Object.entries(FRAMEWORK_SIGNATURES)) {
    if (check(pkg)) return name;
  }

  return 'unknown';
}

export function readProjectMeta(cwd = process.cwd()) {
  const pkgPath = join(cwd, 'package.json');
  let pkg = {};
  
  if (existsSync(pkgPath)) {
    try {
      pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    } catch {}
  }

  // Read docker-compose service names if present
  let dockerServices = [];
  for (const f of ['docker-compose.yml', 'docker-compose.yaml']) {
    const dcPath = join(cwd, f);
    if (existsSync(dcPath)) {
      const content = readFileSync(dcPath, 'utf8');
      const matches = content.match(/^  (\w+):/gm) || [];
      dockerServices = matches.map(m => m.trim().replace(':', ''));
    }
  }

  return {
    name: pkg.name || cwd.split('/').pop(),
    version: pkg.version || 'unknown',
    description: pkg.description || '',
    framework: detectFramework(cwd),
    dependencies: {
      ...pkg.dependencies,
      ...pkg.devDependencies,
    },
    scripts: pkg.scripts || {},
    dockerServices,
    cwd,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function readDockerComposePort() {
  for (const f of ['docker-compose.yml', 'docker-compose.yaml']) {
    if (!existsSync(f)) continue;
    const content = readFileSync(f, 'utf8');
    // Match "- '3000:3000'" or "- 3000:3000"
    const match = content.match(/['"]?(\d{2,5}):\d{2,5}['"]?/);
    if (match) return parseInt(match[1]);
  }
  return null;
}

function readEnvPort() {
  for (const f of ['.env', '.env.local', '.env.development']) {
    if (!existsSync(f)) continue;
    const content = readFileSync(f, 'utf8');
    const match = content.match(/^(?:PORT|APP_PORT|SERVER_PORT)\s*=\s*(\d+)/m);
    if (match) return parseInt(match[1]);
  }
  return null;
}

function readPackageScriptPort() {
  if (!existsSync('package.json')) return null;
  try {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    const scripts = Object.values(pkg.scripts || {}).join(' ');
    const match = scripts.match(/--port[= ](\d+)/);
    if (match) return parseInt(match[1]);
  } catch {}
  return null;
}

async function isPortOpen(port) {
  return new Promise(resolve => {
    const socket = new net.Socket();
    socket.setTimeout(300);
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => { socket.destroy(); resolve(false); });
    socket.once('timeout', () => { socket.destroy(); resolve(false); });
    socket.connect(port, '127.0.0.1');
  });
}

async function scanPorts(ports) {
  for (const port of ports) {
    if (await isPortOpen(port)) return port;
  }
  return null;
}
