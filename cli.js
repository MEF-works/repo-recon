#!/usr/bin/env node

import { mkdirSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { detectPort, readProjectMeta } from '../src/detect.js';
import { discoverRoutes } from '../src/routes.js';
import { captureAll } from '../src/screenshot.js';
import { buildContextPacket } from '../src/report.js';

// ─── Chalk + Ora loaded dynamically for ESM ─────────────────────────────────
const { default: chalk } = await import('chalk');
const { default: ora } = await import('ora');

const OUTPUT_DIR = join(process.cwd(), '.repo-recon');
const VERSION = '1.0.0';

// ─── Args ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flags = {
  port: getFlag(args, '--port', '-p'),
  url: getFlag(args, '--url', '-u'),
  help: args.includes('--help') || args.includes('-h'),
  version: args.includes('--version') || args.includes('-v'),
  noScreenshots: args.includes('--no-screenshots'),
};

if (flags.version) {
  console.log(`repo-recon v${VERSION}`);
  process.exit(0);
}

if (flags.help) {
  console.log(`
${chalk.bold('repo-recon')} v${VERSION}
Drop a visual + behavioral context packet into any repo.

${chalk.bold('Usage:')}
  npx repo-recon                    Auto-detect everything
  npx repo-recon --port 3000        Specify port
  npx repo-recon --url http://...   Specify full base URL
  npx repo-recon --no-screenshots   Skip screenshots (JSON only)

${chalk.bold('Output:')}
  .repo-recon/
    context.json          Full project + runtime context
    screenshots/
      home.png
      [route].png
      ...

${chalk.bold('Options:')}
  --port, -p       Override detected port
  --url, -u        Override base URL entirely
  --no-screenshots Skip screenshot capture
  --version, -v    Show version
  --help, -h       Show this message
  `);
  process.exit(0);
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function run() {
  console.log();
  console.log(chalk.bold.cyan('  ⬡  repo-recon') + chalk.dim(` v${VERSION}`));
  console.log(chalk.dim('  Building your AI context packet...\n'));

  let spinner;

  // Step 1: Detect project
  spinner = ora('  Detecting project...').start();
  const cwd = process.cwd();
  const meta = readProjectMeta(cwd);
  spinner.succeed(`  Project: ${chalk.bold(meta.name)} ${chalk.dim(`(${meta.framework})`)}`);

  // Step 2: Find running server
  spinner = ora('  Finding running server...').start();
  let baseUrl = flags.url || null;
  
  if (!baseUrl) {
    const port = flags.port ? parseInt(flags.port) : await detectPort();
    if (!port) {
      spinner.fail('  No running server detected.');
      console.log(chalk.yellow('\n  Start your app first, then run repo-recon again.'));
      console.log(chalk.dim('  Or specify manually: npx repo-recon --port 3000\n'));
      process.exit(1);
    }
    baseUrl = `http://localhost:${port}`;
  }
  spinner.succeed(`  Server: ${chalk.bold(baseUrl)}`);

  // Step 3: Discover routes
  spinner = ora('  Discovering routes...').start();
  const routes = await discoverRoutes(baseUrl, meta.framework, cwd);
  
  if (!routes.length) {
    spinner.warn('  No routes discovered — defaulting to root /');
    routes.push('/');
  } else {
    spinner.succeed(`  Found ${chalk.bold(routes.length)} routes: ${routes.slice(0, 5).join(', ')}${routes.length > 5 ? '...' : ''}`);
  }

  // Step 4: Create output dir
  mkdirSync(OUTPUT_DIR, { recursive: true });

  // Step 5: Screenshot + observe
  let pageResults = [];

  if (!flags.noScreenshots) {
    spinner = ora(`  Capturing ${routes.length} pages...\n`).start();
    
    try {
      pageResults = await captureAll(baseUrl, routes, OUTPUT_DIR);
      const successful = pageResults.filter(p => !p.error).length;
      const failed = pageResults.filter(p => p.error).length;
      
      spinner.succeed(
        `  Captured ${chalk.bold(successful)} pages` + 
        (failed ? chalk.yellow(` (${failed} failed)`) : '')
      );
    } catch (err) {
      spinner.fail(`  Screenshot capture failed: ${err.message}`);
      console.log(chalk.dim('  Continuing without screenshots...\n'));
      pageResults = routes.map(route => ({ route, error: err.message, screenshot: null }));
    }
  } else {
    console.log(chalk.dim('  Skipping screenshots (--no-screenshots)\n'));
    pageResults = routes.map(route => ({ route, page: null, runtime: null }));
  }

  // Step 6: Build context.json
  spinner = ora('  Writing context.json...').start();
  
  buildContextPacket({
    meta,
    baseUrl,
    routes,
    pageResults,
    outputDir: OUTPUT_DIR,
  });

  spinner.succeed('  Context packet written');

  // ─── Summary ────────────────────────────────────────────────────────────────
  console.log();
  console.log(chalk.bold.green('  ✓ Done!'));
  console.log();
  console.log('  ' + chalk.bold('.repo-recon/'));
  console.log('  ├── ' + chalk.cyan('context.json'));
  
  if (!flags.noScreenshots) {
    console.log('  └── ' + chalk.cyan('screenshots/'));
    pageResults
      .filter(p => p.screenshot)
      .forEach((p, i, arr) => {
        const isLast = i === arr.length - 1;
        console.log(`  ${'    '}${isLast ? '└──' : '├──'} ${chalk.dim(p.screenshot.replace('screenshots/', ''))}`);
      });
  }

  console.log();
  console.log(chalk.dim('  Tip: Add .repo-recon/ to your repo for instant AI context on any clone.'));
  console.log(chalk.dim('  Or add it to .gitignore to keep it local only.'));
  console.log();
}

// ─── Error handling ──────────────────────────────────────────────────────────
run().catch(err => {
  console.error(chalk.red('\n  Fatal error:'), err.message);
  if (process.env.DEBUG) console.error(err);
  process.exit(1);
});

// ─── CLI helpers ─────────────────────────────────────────────────────────────
function getFlag(args, ...names) {
  for (const name of names) {
    const i = args.indexOf(name);
    if (i !== -1 && args[i + 1] && !args[i + 1].startsWith('-')) {
      return args[i + 1];
    }
  }
  return null;
}
