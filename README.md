# repo-recon

> Drop a visual + behavioral context packet into any repo. Give any AI instant understanding of your running app — not just the code, but what it actually looks like and how it behaves.

## Usage

Start your app, then run:

```bash
npx repo-recon
```

That's it. No install. Runs once and leaves.

## Output

```
.repo-recon/
  context.json          ← Full project + runtime context
  screenshots/
    home.png
    about.png
    products.png
    checkout.png
    ...
```

## What it captures

**Project structure**
- Framework detection (Next.js, Vite, Nuxt, SvelteKit, Remix, etc.)
- Dependencies categorized by type (UI, auth, payments, database, etc.)
- NPM scripts

**Route discovery**
- File-based routing (Next.js app/pages dir, SvelteKit routes, Nuxt pages)
- React Router config scanning
- Active probe of common routes (/, /about, /shop, /checkout, etc.)

**Per-page runtime capture**
- Full-page screenshot
- Page title, meta description, h1, headings
- Nav items (great for site structure understanding)
- Element counts: forms, buttons, inputs, links
- Load time (DOM + fully loaded)
- JS errors observed
- API calls made (fetch/XHR, deduplicated)
- External services detected (analytics, CDNs, payment processors, etc.)
- HTTP error responses (4xx/5xx)
- Console warnings

**Site-wide runtime summary**
- Avg/max load times across all pages
- All unique JS errors
- All API endpoints observed
- All external services
- All HTTP errors

## Options

```
npx repo-recon                    Auto-detect everything
npx repo-recon --port 3000        Specify port
npx repo-recon --url http://...   Specify full base URL
npx repo-recon --no-screenshots   JSON context only (faster)
npx repo-recon --help
npx repo-recon --version
```

## Port detection order

1. `docker-compose.yml` exposed ports
2. `.env` / `.env.local` / `.env.development` PORT variable
3. `package.json` scripts `--port` flag
4. Active scan of common ports: 3000, 3001, 4000, 4200, 5000, 5173, 8000, 8080

## AI usage

Once generated, paste `context.json` into any AI conversation. Reference the screenshots folder for visual context.

The `aiPromptHint` field in `context.json` gives the AI a quick orientation:
```json
"aiPromptHint": "This is a next.js project named 'my-app'. 8 pages were captured with screenshots..."
```

## .gitignore recommendation

Committed context packets give any contributor (or AI) instant orientation:
```gitignore
# Option A: Commit it (recommended for team/AI context)
# .repo-recon/

# Option B: Keep it local only
.repo-recon/
```

## Requirements

- Node.js >= 18
- A running local server (Docker, `npm run dev`, etc.)
- ~300MB disk for Puppeteer's bundled Chromium (first run only, cached by npx)

---

Built for developers who want their AI tools to actually understand their project.
