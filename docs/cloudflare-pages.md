# Web build on Cloudflare Pages

Cloudflare Pages is connected to `guudlab/streetborn` (production branch `main`, previews for every other branch/PR).

| Field | Value |
| --- | --- |
| Framework preset | None |
| Root directory | `/` (repo root) |
| Build command | `npm ci && npm run build:web --workspace apps/mobile` |
| Build output directory | `apps/mobile/dist` |
| `NODE_VERSION` | `22` |
| `EXPO_BASE_URL` | empty (set it to a single space-free empty value, or leave unset) |
| `EXPO_PUBLIC_INVITE_BASE` | the final site URL, e.g. `https://streetborn.pages.dev` |

SPA fallback comes from `apps/mobile/public/_redirects` (Expo copies `public/` into `dist/`).
`apps/mobile/netlify.toml` is kept only until Netlify is switched off.
