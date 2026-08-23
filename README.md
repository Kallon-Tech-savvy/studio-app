# Studio App

Production-oriented photo delivery app for a small photography studio.

## Architecture

- React + Vite frontend
- Cloudflare Worker + Hono API
- Supabase Auth + Postgres + RLS
- Cloudflare R2 for photo masters
- Optional Upstash Redis cache for the public gallery index
- Resend for gallery delivery email
- Token-gated client galleries; no client account is required

### Data ownership

The system follows a strict boundary:

`UI -> hooks -> domain/services -> Worker API -> Supabase/R2`

- `src/types` contains shared domain types.
- `src/domain` contains pure business rules and indexes.
- `src/hooks` owns server-state orchestration and upload state.
- `src/services/adminApi.ts` is the single browser API client.
- `worker/index.ts` is the only write path for protected studio operations.
- `supabase/schema.sql` is the authorization boundary; UI permissions are never trusted.

## Important production rules

1. Never commit `.env`, `.dev.vars`, `.wrangler`, or generated build state.
2. Never put a Supabase service-role key in the browser or Worker environment used for caller-scoped requests.
3. Client gallery access is controlled server-side by the private gallery token.
4. Download authorization is enforced server-side using gallery status, payment balance, and `downloads_enabled`.
5. Album/photo mutations validate that the target record belongs to the requested gallery.
6. Public gallery discovery only exposes galleries explicitly marked public and already in `READY`/`PUBLISHED` state.
7. The public gallery list may expose an access token only for galleries deliberately marked public.
8. Photo masters stay in R2; Postgres stores metadata and the R2 key.
9. Uploads are processed sequentially in the UI to avoid saturating the browser/Worker with many large multipart requests.

## Setup

```bash
npm install
cp .env.example .env
cp .dev.vars.example .dev.vars
```

Fill in your real Supabase project URL and anon key from **Settings → API** in the Supabase dashboard.
This app runs on two separate layers — the browser (built by Vite) and the Cloudflare Worker — and each
needs its own copy of the same two values, under different variable names:

| File          | Variables                                      | Read by            |
| -------------- | ----------------------------------------------- | ------------------ |
| `.env`         | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`   | Vite (the browser)  |
| `.dev.vars`    | `SUPABASE_URL`, `SUPABASE_ANON_KEY`             | The Worker (backend) |

It's easy to fill in one and forget the other — if you see `Uncaught Error: supabaseKey is required.` in the
browser console, that means `.env` is missing or incomplete (that error comes from client-side code, not the
Worker). Note that Vite only reads `.env` when the dev server starts, so restart `npm run dev` after creating
or editing it.

Create the R2 bucket configured in `wrangler.jsonc`:

```bash
wrangler r2 bucket create studio-photos
```

Apply `supabase/schema.sql` to the Supabase SQL editor.

Set Worker secrets for deployment:

```bash
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_ANON_KEY
wrangler secret put UPSTASH_REDIS_REST_URL
wrangler secret put UPSTASH_REDIS_REST_TOKEN
wrangler secret put RESEND_API_KEY
wrangler secret put RESEND_FROM_EMAIL
```

Deploy:

```bash
npm run deploy
```

## Bootstrap owner

The database migration contains the bootstrap owner email in the staff-profile trigger/RPC. Change that value before running the schema in a new production Supabase project.

After the owner signs in, additional staff accounts can be created and promoted through the staff table/API.

## Verification

Run these checks before deployment:

```bash
npm install
npm run build
```

Then verify:

- unauthenticated users can open public galleries
- private gallery tokens reject invalid/expired/revoked links
- unpaid clients can preview but cannot download masters
- paid `READY`/`PUBLISHED` galleries can download
- staff without upload permission cannot upload/delete/reassign photos
- staff without finance permission cannot access clients/financial data
- album IDs from another gallery are rejected
- deleting a photo removes its database row and attempts R2 cleanup
- regenerating a gallery link invalidates the old token
- no secrets are present in the repository or deployment bundle

## Current scalability boundary

The current design is appropriate for a small-to-medium studio. The next scaling step for very large shoots is direct browser-to-R2 multipart upload with short-lived upload authorization, plus generated thumbnail/preview objects. That removes large image bytes from the Worker request path and avoids decoding full-resolution masters in the browser just to create thumbnails.
