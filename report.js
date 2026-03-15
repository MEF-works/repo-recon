import { writeFileSync } from 'fs';
import { join } from 'path';

export function buildContextPacket({ meta, baseUrl, routes, pageResults, outputDir }) {
  const packet = {
    _meta: {
      generatedAt: new Date().toISOString(),
      generatedBy: 'repo-recon',
      version: '1.0.0',
      howToUse: 'Paste this file + reference the screenshots to give any AI instant understanding of your running app.',
    },

    project: {
      name: meta.name,
      version: meta.version,
      description: meta.description,
      framework: meta.framework,
      baseUrl,
      dockerServices: meta.dockerServices,
    },

    dependencies: summarizeDependencies(meta.dependencies),

    scripts: meta.scripts,

    site: {
      totalPages: pageResults.filter(p => !p.error).length,
      failedPages: pageResults.filter(p => p.error).length,
      routes: routes,
      navigation: extractSiteNav(pageResults),
    },

    pages: pageResults.map(result => {
      if (result.error) {
        return {
          route: result.route,
          error: result.error,
        };
      }

      return {
        route: result.route,
        screenshot: result.screenshot,
        title: result.page.title,
        description: result.page.description,
        h1: result.page.h1,
        headings: result.page.headings,
        navigation: result.page.navItems,
        hasAuthWall: result.page.hasAuthWall,
        elements: result.page.elementCounts,
        runtime: result.runtime,
      };
    }),

    runtime: {
      summary: buildRuntimeSummary(pageResults),
    },

    aiPromptHint: buildAiHint(meta, pageResults),
  };

  const outPath = join(outputDir, 'context.json');
  writeFileSync(outPath, JSON.stringify(packet, null, 2), 'utf8');
  return packet;
}

function summarizeDependencies(deps = {}) {
  const categories = {
    ui: [],
    routing: [],
    state: [],
    auth: [],
    payments: [],
    database: [],
    api: [],
    testing: [],
    other: [],
  };

  const categoryMap = {
    ui: ['react', 'vue', 'svelte', 'angular', 'tailwind', 'chakra', 'mui', 'shadcn', 'bootstrap', 'antd', 'radix'],
    routing: ['react-router', 'next', 'nuxt', 'tanstack-router', 'wouter'],
    state: ['redux', 'zustand', 'jotai', 'recoil', 'mobx', 'pinia', 'valtio'],
    auth: ['next-auth', 'clerk', 'auth0', 'supabase', 'firebase', 'passport', 'jwt'],
    payments: ['stripe', 'square', 'braintree', 'paypal', 'nmi', 'authorize'],
    database: ['prisma', 'drizzle', 'mongoose', 'sequelize', 'typeorm', 'pg', 'mysql'],
    api: ['axios', 'swr', 'react-query', 'apollo', 'urql', 'trpc', 'graphql'],
    testing: ['jest', 'vitest', 'cypress', 'playwright', 'testing-library'],
  };

  for (const [pkg] of Object.entries(deps)) {
    let categorized = false;
    for (const [cat, keywords] of Object.entries(categoryMap)) {
      if (keywords.some(k => pkg.toLowerCase().includes(k))) {
        categories[cat].push(pkg);
        categorized = true;
        break;
      }
    }
    if (!categorized && !pkg.startsWith('@types/') && !pkg.startsWith('eslint')) {
      categories.other.push(pkg);
    }
  }

  // Drop empty categories
  return Object.fromEntries(
    Object.entries(categories).filter(([, v]) => v.length > 0)
  );
}

function extractSiteNav(pageResults) {
  // Pull nav items from the root page as the source of truth
  const root = pageResults.find(p => p.route === '/');
  return root?.page?.navItems || [];
}

function buildRuntimeSummary(pageResults) {
  const successful = pageResults.filter(p => !p.error && p.runtime);
  if (!successful.length) return null;

  const loadTimes = successful.map(p => p.runtime.loadTimeMs).filter(Boolean);
  const allErrors = successful.flatMap(p => p.runtime.jsErrors || []);
  const allApiCalls = successful.flatMap(p => p.runtime.apiCalls || []);
  const allExternalServices = [...new Set(
    successful.flatMap(p => p.runtime.externalServices || [])
  )];
  const allErrorResponses = successful.flatMap(p => p.runtime.errorResponses || []);

  return {
    avgLoadTimeMs: loadTimes.length ? Math.round(loadTimes.reduce((a, b) => a + b) / loadTimes.length) : null,
    maxLoadTimeMs: loadTimes.length ? Math.max(...loadTimes) : null,
    totalJsErrors: allErrors.length,
    uniqueJsErrors: [...new Set(allErrors)].slice(0, 10),
    apiEndpointsObserved: [...new Map(allApiCalls.map(c => [c.url, c])).values()].slice(0, 30),
    externalServices: allExternalServices,
    httpErrors: allErrorResponses.slice(0, 15),
  };
}

function buildAiHint(meta, pageResults) {
  const successful = pageResults.filter(p => !p.error).length;
  const hasErrors = pageResults.some(p => p.runtime?.jsErrors?.length);
  const framework = meta.framework;
  
  const lines = [
    `This is a ${framework} project named "${meta.name}".`,
    `${successful} pages were captured with screenshots in the screenshots/ folder.`,
    `Review context.json for structure, dependencies, runtime behavior, and per-page element counts.`,
    `Screenshots show the actual rendered UI — reference them alongside the code for full context.`,
  ];

  if (hasErrors) {
    lines.push(`⚠️ Runtime JS errors were detected on some pages — see pages[].runtime.jsErrors.`);
  }

  return lines.join(' ');
}
