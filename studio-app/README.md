# studio-app

Single Cloudflare Worker serving a React + Vite frontend and a Hono API,
backed by Supabase (DB + Auth) and Upstash Redis, with photo storage on R2.
Everything below fits inside the free tier of each service.

This is v1 wiring, not the final design or the full feature set — see
"Not built yet" at the bottom.

## Layout


studio-app/
├── wrangler.jsonc         # Worker config: assets, R2 binding, cron trigger
├── worker/
│   ├── index.ts           # Hono routes + the ASSETS catch-all + scheduled()
│   ├── env.d.ts            # Env type (placeholder until cf-typegen runs)
│   └── lib/
│       ├── supabase.ts    # Server-side Supabase client (forwards caller JWT)
│       └── redis.ts       # Upstash Redis client
├── src/                   # React frontend
│   ├── main.tsx
│   ├── App.tsx             # Wiring-check placeholder page
│   └── lib/supabase.ts    # Browser-side Supabase client (anon key)
├── supabase/
│   └── schema.sql          # heartbeat + galleries + photos, with RLS
├── .dev.vars.example       # Worker secrets template (local dev)
└── .env.example             # Vite env template (local dev)
```

## 1. Install

```bash
npm install
npm install -g wrangler   # if you don't have it
wrangler login
```

## 2. Create the R2 bucket

```bash
wrangler r2 bucket create studio-photos
```

Matches the `PHOTOS` binding in `wrangler.jsonc`. Photo upload/derivative
routes aren't wired yet — this just reserves the bucket.

## 3. Create the Supabase project

1. New project at supabase.com — free tier, no card required.
2. SQL Editor → paste and run `supabase/schema.sql`.
3. Project Settings → API → copy the **Project URL** and **anon public**
   key. You won't need the service-role key for anything in this scaffold.

## 4. Fix the auth email limit (do this before you rely on login)

Supabase's built-in email sender is capped at 2 emails/hour, which breaks
password resets and magic links under any real usage. Fix:

**Easiest — Resend's native integration:**
Supabase Dashboard → your project → Integrations → find **Resend** →
Connect. It creates a Resend API key and fills in your SMTP settings for
you. Add a sending domain in Resend afterward (Domains → Add Domain, then
add the DKIM/SPF records it gives you at your DNS provider) so mail sends
from your own domain instead of a shared test one.

**Manual — any SMTP provider (Resend, Postmark, Brevo, SES):**
Project Settings → Authentication → SMTP Settings → Enable Custom SMTP,
then fill in the host/port/username/password/sender address from your
provider's dashboard and save.

Either way this raises Supabase's own auth email rate limit from 2/hour
to 30/hour (adjustable later under Authentication → Rate Limits).

## 5. Create the Upstash Redis database

New database at upstash.com — free tier. Copy the **REST URL** and
**REST token** from the database details page (not the TCP endpoint —
the Cloudflare-compatible client here talks HTTP).

## 6. Local dev

```bash
cp .dev.vars.example .dev.vars   # Worker secrets
cp .env.example .env             # Vite env vars
# fill in both with the values from steps 3 and 5
npm run dev
```

`vite dev` runs through the Cloudflare Vite plugin, so it's exercising
the real Workers runtime — R2, the cron trigger, bindings all behave as
they would in production.

## 7. Set secrets for the deployed Worker

```bash
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_ANON_KEY
wrangler secret put UPSTASH_REDIS_REST_URL
wrangler secret put UPSTASH_REDIS_REST_TOKEN
```

## 8. Deploy

```bash
npm run deploy
```

Ships the Vite build and the Worker in one operation. The cron trigger
in `wrangler.jsonc` is registered automatically — no separate step.

## Verifying the keep-alive works

Cloudflare dashboard → Workers & Pages → studio-app → Triggers tab shows
the cron schedule and its run history. Each run should show as a quick
success; check `heartbeat.pinged_at` doesn't matter here since the
Worker only reads it, but a green run history entry every ~3 days is
what tells you Supabase's inactivity clock is being reset.

## Not built yet (intentionally out of scope for v1)

- Photo upload endpoint (presigned R2 PUT + a row insert into `photos`)
- On-the-fly thumbnails via Cloudflare Image Transformations (free up to
  5,000 unique transforms/month, pairs directly with R2)
- Login / magic-link screen (the browser Supabase client in
  `src/lib/supabase.ts` is ready for it)
- The actual designed gallery UI — `App.tsx` right now only proves the
  Worker → Supabase → Redis path works end to end
