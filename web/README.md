# StyleNotes website

The landing site for StyleNotes, deployed to **Cloudflare Workers**.

It is a separate project on purpose: the desktop app is a SPA (`ssr = false`,
`adapter-static`), while a marketing site must ship real HTML so crawlers and
link previews see it. The two share a design language, not a build.

## Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Framework | SvelteKit 3 (`@sveltejs/kit` ^3.1) | Same framework as the app, but server-rendered |
| Adapter | `@sveltejs/adapter-cloudflare` ^8 | Worker + static assets, one deploy |
| Styling | Tailwind v4 | The app's tokens are ported verbatim |
| Icons | `@lucide/svelte` | The app's icon set |
| Tests | Vitest | Pure modules only (`src/lib/*.test.ts`) |

SvelteKit 3 has two changes worth knowing if you have used 2.x:

- **There is no `svelte.config.js`.** Configuration is passed to the
  `sveltekit()` plugin in `vite.config.ts`. A stray config file fails the build.
- **`$lib` is now `#lib`.** Subpath imports come from `package.json` `imports`.

## Commands

```bash
cd web
bun install
bun run dev        # http://localhost:5173
bun run check      # svelte-check
bun run test       # vitest
bun run build      # prerender + adapter-cloudflare
bun run preview:cf # preview the built Worker with wrangler
bun run deploy:dry # validate the Worker bundle, no credentials needed
```

## How the SEO works

- **Every page is prerendered** (`src/routes/+layout.ts` sets `prerender = true`).
  Only `/download` and `/download/[platform]` opt out, because they read the
  latest GitHub release at request time.
- **`Seo.svelte`** emits title, description, canonical, Open Graph, Twitter card
  and JSON-LD. Canonical and OG URLs are absolute because `paths.origin` is set
  in `vite.config.ts` — otherwise they would say `http://sveltekit-prerender`.
- **`robots.txt` and `sitemap.xml` are routes**, not static files, so they are
  generated from `sitemapRoutes` in `src/lib/site.ts`. Add a page there and the
  sitemap follows.
- **`handleHttpError: 'fail'`** means a broken internal link fails the build
  instead of shipping a 404.
- **Images carry `width`/`height`**, so the page does not shift as they decode
  (a CLS penalty). The hero is `fetchpriority="high"`; everything below the fold
  is `loading="lazy"`.
- **The FAQ uses `<details>`**, so answers are in the HTML before hydration and
  the markup matches the `FAQPage` schema.

## The download redirect

`/download/[platform]` answers `302` to the matching installer of the latest
GitHub release. That keeps the URL stable across releases and still counts the
download on GitHub. `/download` is the human page, and it never redirects on its
own so shared links land on the page that lists every platform.

Set `GITHUB_TOKEN` in the Worker for the API lookup. Without it the site still
works, but shares GitHub's unauthenticated limit of 60 requests per hour per IP —
and Workers share egress IPs, so that ceiling arrives quickly.

## Assets

Screenshots and the logo are **not** duplicated in this repo. `scripts/sync-assets.mjs`
copies them out of `../docs/assets` on `prepare`/`prebuild`, and the copies are
gitignored. Update a screenshot in `docs/assets` and the site picks it up.

## Deploying

`.github/workflows/website.yml` runs `check` → `test` → `build` → `deploy:dry` on
every PR touching `web/**`, and deploys on `main`. It also redeploys when the
app's Release workflow finishes, so the download page is never stale.

Required repository secrets:

| Secret | Purpose |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Workers Scripts:Edit (+ Zone:Cache Purge if you enable the purge step) |
| `CLOUDFLARE_ACCOUNT_ID` | Target account |

Optional: `CLOUDFLARE_ZONE_ID` and the `PURGE_CACHE` variable for the cache purge
step, and the `PUBLIC_SITE_URL` variable to point canonical URLs at a staging
domain.

Set the custom domain in `wrangler.jsonc` once DNS points at Cloudflare. Until
then the Worker is served from `stylenotes-web.<subdomain>.workers.dev`.

The production domain is **stylenotes.evofast.net**, declared as a route on the
existing `evofast.net` zone:

```jsonc
"routes": [{ "pattern": "stylenotes.evofast.net/*", "zone_name": "evofast.net" }]
```

Two details that bite: the pattern needs the `/*` (a bare hostname is parsed as
a path), and `zone_name` is used rather than `custom_domain` because the host is
a subdomain of a zone you already control. See the comments in `wrangler.jsonc`.

## Keeping the look in step with the app

`src/app.css` is a copy of the app's palette and type scale. When the app's
`src/routes/layout.css` changes a token, change it here too — the screenshots on
this site are pictures of that app, so a drift is visible immediately.

`src/lib/components/base/button.svelte` is the app's button, copied for the same
reason. It differs only in its import path (`#lib` instead of `$lib`).
