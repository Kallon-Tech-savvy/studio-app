# Proof Studio App

A mobile-first photo studio workspace and token-gated client gallery. Staff manage clients, galleries, albums, uploads, permissions, and delivery. Clients open private galleries without creating an account.

## Stack

- React 18 + TypeScript + Vite
- Cloudflare Worker + Hono
- Supabase Auth, Postgres, and RLS
- Cloudflare R2 for photo storage
- Optional Upstash Redis integration
- JSZip for client-side batch downloads
- Web App Manifest + Service Worker for installability and offline resilience

## Architecture

```text
Browser UI -> hooks/domain/services -> Worker API -> Supabase / R2
```

- `src/types` contains shared domain types.
- `src/domain` contains pure business rules.
- `src/hooks` owns server-state and upload orchestration.
- `src/services/adminApi.ts` is the protected browser API client.
- `worker/index.ts` is the backend boundary for protected mutations and token-gated gallery reads.
- `supabase/schema.sql` defines database functions, RLS, and authorization rules.

## Local setup

Requirements: Node.js 18+ and a Supabase project. Wrangler is installed with the project dependencies.

```bash
npm install
copy .env.example .env
New-Item .dev.vars
```

PowerShell uses `copy`; Git Bash/macOS/Linux can use `cp` instead.

Set the browser variables in `.env`:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Set the Worker variables in `.dev.vars`:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
RESEND_API_KEY=
RESEND_FROM_EMAIL=
```

Apply `supabase/schema.sql` in the Supabase SQL editor. Create the configured R2 bucket before local Worker development:

```bash
npx wrangler r2 bucket create studio-photos
```

Start the app:

```bash
npm run dev
```

The browser app and Worker API are served through the Cloudflare Vite plugin. Restart the dev server after changing `.env`; Vite reads those values at startup.

## PWA and offline behavior

- `public/manifest.json` enables standalone installation and includes the app icon.
- `public/sw.js` is registered only in production builds.
- Static GET requests use stale-while-revalidate caching.
- API GET requests use network-first caching with a JSON `503` fallback when no cached response exists.
- Navigation falls back to the cached app shell when the network is unavailable.
- Public gallery metadata and selected proof IDs hydrate from `localStorage` while the network refreshes in the background.
- The offline banner is non-blocking and respects `prefers-reduced-motion`.
- POST, PATCH, and DELETE requests are never cached or replayed automatically. Mutations require a connection and report status through in-app toasts.

The first visit must complete online before offline gallery data can be shown. Private gallery photo bytes are fetched through token-gated Worker routes and are not treated as durable offline storage.

## API surface

Public gallery reads:

- `GET /api/g/:token`
- `GET /api/g/:token/albums`
- `GET /api/g/:token/photos`
- `GET /api/g/:token/photos/:photoId`
- `GET /api/g/:token/photos/:photoId?download=true`

The client batch download button fetches selected originals through the per-photo download route and creates a ZIP in the browser. There is intentionally no `/api/g/:token/download` endpoint.

Protected studio operations are under `/api/studio/*` and `/api/galleries/*`; the Worker validates the Supabase bearer token and database ownership rules.

## Scripts

```bash
npm run dev       # Start local Vite/Worker development
npm run build     # Type-check and create client + Worker production bundles
npm run preview   # Preview the Vite production output
npm run deploy    # Build and deploy with Wrangler
npm run cf-typegen # Regenerate Cloudflare Worker types
```

## Deployment

Set production Worker secrets before deploying:

```bash
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_ANON_KEY
npx wrangler secret put UPSTASH_REDIS_REST_URL
npx wrangler secret put UPSTASH_REDIS_REST_TOKEN
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put RESEND_FROM_EMAIL
npm run deploy
```

Do not commit `.env`, `.dev.vars`, secrets, Wrangler state, or generated `dist` output.

## Security rules

- Never expose a Supabase service-role key in browser code.
- Client access is controlled by the private gallery token and server-side status checks.
- Original downloads require an enabled gallery in `READY` or `PUBLISHED` state with no outstanding balance.
- Album and photo mutations verify that records belong to the requested gallery.
- Photo masters remain in R2; Postgres stores metadata and object keys.
- UI permission checks improve usability but are not an authorization boundary.

## Verification checklist

```bash
npm install
npm run build
```

Before release, verify:

- The app installs from a production origin and the manifest icon loads.
- A first online visit caches the app shell and later navigations work offline.
- Cached public gallery data hydrates without blocking the page.
- Offline and reconnect banners are visible without modal dialogs.
- Layout remains usable at 360px and fixed controls clear the device safe area.
- Interactive controls are at least 44px on touch layouts.
- Invalid, expired, revoked, draft, and unpaid gallery links receive the expected server response.
- Paid `READY`/`PUBLISHED` galleries can download originals.
- Staff permissions are enforced by the Worker and Supabase, not only by hidden buttons.

## Scaling boundary

This architecture fits a small-to-medium studio. For very large shoots, move uploads to browser-to-R2 multipart transfers with short-lived authorization and generate preview objects asynchronously. That keeps large image bytes out of the Worker request path and reduces mobile memory pressure.
