import puppeteer from 'puppeteer';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

export async function captureAll(baseUrl, routes, outputDir) {
  const screenshotsDir = join(outputDir, 'screenshots');
  mkdirSync(screenshotsDir, { recursive: true });

  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  });

  const results = [];

  for (const route of routes) {
    try {
      const result = await capturePage(browser, baseUrl, route, screenshotsDir);
      results.push(result);
    } catch (err) {
      results.push({
        route,
        error: err.message,
        screenshot: null,
      });
    }
  }

  await browser.close();
  return results;
}

async function capturePage(browser, baseUrl, route, screenshotsDir) {
  const page = await browser.newPage();
  
  // Intercept and observe
  const observations = {
    consoleMessages: [],
    networkRequests: [],
    networkResponses: [],
    jsErrors: [],
    domContentLoaded: null,
    fullyLoaded: null,
    apiCalls: [],
    externalResources: [],
  };

  const startTime = Date.now();

  // Console observer
  page.on('console', (msg) => {
    const entry = {
      type: msg.type(),
      text: msg.text().slice(0, 300),
    };
    observations.consoleMessages.push(entry);
    if (msg.type() === 'error') {
      observations.jsErrors.push(entry.text);
    }
  });

  // Page error observer
  page.on('pageerror', (err) => {
    observations.jsErrors.push(err.message.slice(0, 300));
  });

  // Network observer
  page.on('request', (req) => {
    const url = req.url();
    const type = req.resourceType();
    
    // Flag API calls separately
    if (type === 'fetch' || type === 'xhr') {
      observations.apiCalls.push({
        method: req.method(),
        url: sanitizeUrl(url),
        type,
      });
    }
    
    // Flag external resources
    if (!url.startsWith(baseUrl) && !url.startsWith('data:')) {
      observations.externalResources.push({
        url: sanitizeUrl(url),
        type,
      });
    }

    observations.networkRequests.push({
      method: req.method(),
      url: sanitizeUrl(url),
      resourceType: type,
    });
  });

  page.on('response', (res) => {
    const status = res.status();
    if (status >= 400) {
      observations.networkResponses.push({
        url: sanitizeUrl(res.url()),
        status,
      });
    }
  });

  // Viewport: standard desktop
  await page.setViewport({ width: 1440, height: 900 });

  // Navigate
  const response = await page.goto(`${baseUrl}${route}`, {
    waitUntil: 'networkidle2',
    timeout: 15000,
  });

  observations.domContentLoaded = Date.now() - startTime;

  // Wait a beat for any JS rendering
  await new Promise(r => setTimeout(r, 800));

  observations.fullyLoaded = Date.now() - startTime;

  // Grab page metadata from the DOM
  const pageMeta = await page.evaluate(() => {
    const getMeta = (name) =>
      document.querySelector(`meta[name="${name}"]`)?.content ||
      document.querySelector(`meta[property="${name}"]`)?.content || null;

    // Gather visible text sections (headings + first paragraphs)
    const headings = [...document.querySelectorAll('h1, h2, h3')]
      .slice(0, 8)
      .map(el => ({ tag: el.tagName.toLowerCase(), text: el.innerText?.trim().slice(0, 120) }))
      .filter(h => h.text);

    // Count interactive elements
    const forms = document.querySelectorAll('form').length;
    const buttons = document.querySelectorAll('button, [role="button"], input[type="submit"]').length;
    const links = document.querySelectorAll('a[href]').length;
    const images = document.querySelectorAll('img').length;
    const inputs = document.querySelectorAll('input, select, textarea').length;

    // Nav items (good for understanding site structure)
    const navItems = [...document.querySelectorAll('nav a, header a')]
      .slice(0, 12)
      .map(a => ({ text: a.innerText?.trim(), href: a.getAttribute('href') }))
      .filter(a => a.text && a.href);

    return {
      title: document.title,
      description: getMeta('description') || getMeta('og:description'),
      h1: document.querySelector('h1')?.innerText?.trim().slice(0, 200),
      headings,
      navItems,
      elementCounts: { forms, buttons, links, images, inputs },
      hasAuthWall: !!(
        document.querySelector('[class*="login"]') ||
        document.querySelector('[class*="auth"]') ||
        document.querySelector('input[type="password"]')
      ),
    };
  });

  // Screenshot — full page for root, viewport for others
  const isRoot = route === '/';
  const filename = routeToFilename(route);
  const screenshotPath = join(screenshotsDir, filename);
  
  await page.screenshot({
    path: screenshotPath,
    fullPage: true,
    type: 'png',
  });

  await page.close();

  // Clean up network observations — deduplicate + cap arrays
  const cleanedObs = {
    loadTimeMs: observations.fullyLoaded,
    domReadyMs: observations.domContentLoaded,
    httpStatus: response?.status() || null,
    jsErrors: [...new Set(observations.jsErrors)].slice(0, 10),
    apiCalls: deduplicateByUrl(observations.apiCalls).slice(0, 20),
    errorResponses: observations.networkResponses.slice(0, 10),
    externalServices: [...new Set(
      observations.externalResources.map(r => extractDomain(r.url))
    )].filter(Boolean).slice(0, 15),
    consoleWarnings: observations.consoleMessages
      .filter(m => m.type === 'warning')
      .map(m => m.text)
      .slice(0, 5),
  };

  return {
    route,
    screenshot: `screenshots/${filename}`,
    page: pageMeta,
    runtime: cleanedObs,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function routeToFilename(route) {
  if (route === '/') return 'home.png';
  return route.replace(/^\//, '').replace(/\//g, '--') + '.png';
}

function sanitizeUrl(url) {
  // Strip query strings and auth tokens from logged URLs
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return url.slice(0, 100);
  }
}

function extractDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function deduplicateByUrl(arr) {
  const seen = new Set();
  return arr.filter(item => {
    if (seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });
}
