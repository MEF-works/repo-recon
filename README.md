# repo-recon

<p align="center"><img src="repo-recon.png" width="700" alt="repo-recon" /></p>

**Drop a visual and behavioral context packet into any repo.** Give any AI instant understanding of your running app — not just the code, but what it looks like and how it behaves.

- **Zero config** — start your app, run one command, get a `.repo-recon/` folder.
- **Framework-aware** — detects Next.js, Vite, Nuxt, SvelteKit, Remix, Astro, and more; discovers routes from files and probes the live server.
- **Runtime capture** — full-page screenshots, DOM metadata, nav structure, load times, JS errors, API calls, and external services per page.

---

## Quick start

1. Start your app (e.g. `npm run dev` or Docker).
2. From the project root:

```bash
npx repo-recon
```

Output is written to `.repo-recon/`. No install required when using `npx`; first run will download Puppeteer’s Chromium (~300MB, then cached).

---

## Output layout

```
.repo-recon/
├── context.json      # Full project + runtime context (paste into AI)
└── screenshots/
    ├── home.png
    ├── about.png
    ├── products.png
    └── ...
```

---

## What gets captured

### Project

- **Framework** — Next.js, Vite, Nuxt, SvelteKit, Remix, Astro, Gatsby, Express, Fastify, etc.
- **Dependencies** — grouped by category (UI, routing, state, auth, payments, database, API, testing).
- **Scripts** — from `package.json`.
- **Docker** — service names from `docker-compose.yml` when present.

### Routes

- **File-based** — Next.js `app/` and `pages/`, SvelteKit `src/routes`, Nuxt `pages`, etc.
- **Config** — React Router `path=` in `App.jsx` / `routes.js`.
- **Live probe** — common paths (e.g. `/`, `/about`, `/shop`, `/checkout`) verified with HEAD requests.
- Capped at 20 pages so the packet stays useful, not a full crawl.

### Per page

- **Screenshot** — full-page PNG.
- **DOM** — title, meta description, h1, headings (h1–h3), nav links.
- **Elements** — counts of forms, buttons, links, images, inputs.
- **Runtime** — load time (DOM + fully loaded), JS errors, console warnings.
- **Network** — fetch/XHR (deduplicated), 4xx/5xx responses, external domains (analytics, CDNs, etc.).
- **Auth hint** — heuristics for login/auth UI.

### Site-wide summary

- Average and max load times.
- Unique JS errors.
- API endpoints observed.
- External services and HTTP errors.

---

## CLI options

| Option | Description |
|--------|-------------|
| (none) | Auto-detect port and base URL, capture screenshots |
| `--port`, `-p` | Override port (e.g. `--port 3000`) |
| `--url`, `-u` | Override base URL (e.g. `--url http://localhost:4000`) |
| `--no-screenshots` | Only build `context.json` (faster, no Puppeteer screenshots) |
| `--help`, `-h` | Show usage |
| `--version`, `-v` | Show version |

**Examples:**

```bash
npx repo-recon
npx repo-recon --port 3000
npx repo-recon --url http://staging.example.com
npx repo-recon --no-screenshots
```

### Example: React or webpack app

In a React admin (or any webpack/Vite) app that runs with `npm run dev` on port 3000:

1. Start the app: `npm run dev`
2. In another terminal, from that project root: `npx repo-recon --port 3000`
3. You get `.repo-recon/` with `context.json` (project name, deps, scripts, page titles, runtime summary) and `screenshots/home.png` (and other routes if discovered). Then repo-recon exits.

---

## Port detection

If you don’t pass `--port` or `--url`, repo-recon tries, in order:

1. **docker-compose** — exposed port from `docker-compose.yml` / `docker-compose.yaml`
2. **Env** — `PORT`, `APP_PORT`, or `SERVER_PORT` from `.env`, `.env.local`, `.env.development`
3. **package.json** — `--port=<n>` in scripts
4. **Active scan** — first listening port among 3000, 3001, 4000, 4200, 5000, 5173, 8000, 8080, 8888, 9000

If nothing is found, the CLI exits with a message to start the app or pass `--port`.

---

## Using the output with AI

- Attach or paste **`context.json`** into your AI chat for structure, dependencies, routes, and runtime behavior.
- Point the AI at the **`screenshots/`** folder (or specific images) for visual context.

The `aiPromptHint` field in `context.json` gives a one-line orientation, for example:

```json
"aiPromptHint": "This is a next.js project named 'my-app'. 8 pages were captured with screenshots..."
```

---

## .gitignore

- **Commit `.repo-recon/`** — gives every contributor (and AI) the same context on clone.
- **Ignore it** — keep the packet local only.

```gitignore
# Option A: Commit (recommended for shared AI context)
# .repo-recon/

# Option B: Local only
.repo-recon/
```

---

## Requirements

- **Node.js** ≥ 18
- **Running app** — dev server or Docker must be up so repo-recon can hit the base URL and capture pages
- **Disk** — ~300MB for Puppeteer’s Chromium on first `npx` run (cached afterward)

---

## License

MIT.
