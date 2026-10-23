# Web build on Cloudflare

Cloudflare (Workers Builds, static assets) is connected to `guudlab/streetborn`; production branch `main`.
The root `wrangler.jsonc` serves `apps/mobile/dist` with SPA fallback.

| Field | Value |
| --- | --- |
| Build command | `npm ci && npm run build:web --workspace apps/mobile` |
| Deploy command | `npx wrangler deploy` (non-production branches: `npx wrangler versions upload`) |
| Root directory | `/` |
| `NODE_VERSION` | `22` |
| `EXPO_PUBLIC_INVITE_BASE` | the final site URL |

`apps/mobile/app.config.js` uses base path `""` when `WORKERS_CI=1` or `CF_PAGES=1`.
`apps/mobile/netlify.toml` is kept only until Netlify is switched off.
