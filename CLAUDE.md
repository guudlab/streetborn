# STREETBORN: notes for coding agents

The owner (Kaan) writes in Turkish. User-facing strings are Turkish; code, identifiers and comments are English.

## Architecture rules

- **Server-authoritative economy.** The client never sends amounts. Coin/gem change only through the SQL function `grant_currency()`, which writes the append-only `ledger` with an idempotency key. Never add a client-writable table or an RLS write policy.
- **Deterministic engine.** `packages/engine` must stay pure: integer math only, randomness only from `createRng(seed)`, no `Math.random`, `Date`, or platform APIs. A test enforces this. Changing the PRNG or shot math breaks replays of stored matches; if you must, bump an engine version and keep the old path.
- **One formula, two runtimes.** `packages/engine` and `packages/economy` are imported by the Expo app (Metro) and by Supabase Edge Functions (Deno) via relative paths. Use explicit `.ts` extensions in imports and no Node-only APIs outside tests.
- Economy numbers live in `DEFAULT_CONFIG` and are overridden at runtime by the `config` table row `economy`. All numbers are assumptions until soft launch data.
- `inventory.source` must be set on every item grant; the future chain layer only releases items whose source is not `coin`.

## Mobile app

`apps/mobile/AGENTS.md` (from Expo) applies: install native packages with `npx expo install`, check the versioned Expo docs for SDK 58 before using an API, use Expo Router for navigation, never hand-edit `ios/` or `android/`.

3D runs in a canvas on the web and in WebViews on iOS/Android, because expo-gl cannot decode the textures inside the .glb files and three.js rejects its context: the 3D match (`match3d/nativeScene.native.tsx`, protocol in `bridgeTypes.ts`) and each Model3D (`ui/nativeModel.native.tsx`, scene in `ui/modelScene.ts`). The WebViews load generated bundles, `assets/match3d/match.webview.html` and `assets/webview/model.webview.html` (gitignored): run `npm run build:match-webview --workspace apps/mobile` after changing `scene.js`, `stands.js`, `rig.js`, `keeper.js`, `ui/modelScene.ts` or `ui/kitTint.ts` (the start scripts and the sideload workflow do it). Keep those files free of React Native imports.

## Before you finish

```bash
npm run typecheck && npm test
(cd supabase/functions && deno check match-start/index.ts match-finish/index.ts mahalle/index.ts mahalle-close/index.ts profile-set/index.ts career/index.ts train/index.ts shop/index.ts ad-reward/index.ts oyuncu/index.ts account-delete/index.ts dodo-checkout/index.ts dodo-webhook/index.ts)
supabase/tests/run.sh   # needs a Postgres; see the CI workflow
```

## Design skills

`.claude/skills/design-taste-frontend` is vendored from github.com/Leonxlnx/taste-skill (MIT, commit 6010f91). It is written for web pages and dashboards. Use its screenshot-critique loop and its type and motion references on app screens, but StreetBorn's game rules win where they clash: the lime glow, reward effects, icon tiles, the glass tab bar and Concept A tokens in `apps/mobile/src/theme.ts` stay. Do not run its `draw.mjs` to pick a new art direction; the direction is decided (Concept A "Saha Kenarı").
