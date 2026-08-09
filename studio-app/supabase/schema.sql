-- Run this once in the Supabase SQL Editor (or via `supabase db push`
-- if you're using the CLI) after creating your project.

-- ── Keep-alive ───────────────────────────────────────────────────
-- One row, read (never written) by the Worker's cron trigger every
-- ~3 days so the free-tier project never crosses the 7-day
-- inactivity pause.
create table if not exists heartbeat (
  id uuid primary key default gen_random_uuid(),
  pinged_at timestamptz not null default now()
);

insert into heartbeat default values;

alter table heartbeat enable row level security;

create policy "heartbeat is readable by anyone"
  on heartbeat for select
  using (true);

-- ── Studio owner ─────────────────────────────────────────────────
-- Single source of truth for "is the signed-in user the studio
-- owner" at the database level — RLS enforces this directly rather
-- than trusting the Worker's own check alone, so a client hitting
-- Supabase's REST API straight (bypassing the Worker entirely)
-- still can't create galleries or upload photos.
--
-- Replace the email below with your own, and keep it in sync with
-- the OWNER_EMAIL var in wrangler.jsonc — see README.md.
create or replace function is_studio_owner()
returns boolean
language sql
stable
as $$
  select auth.jwt() ->> 'email' = 'you@example.com';
$$;

-- ── Galleries ────────────────────────────────────────────────────
-- One row per shoot. is_public drives the homepage Lightbox list.
-- access_token is how a client actually gets in: a random, unguessable
-- string the owner copies into a link and sends however they like — no
-- client account, no login, no email delivery dependency on us at all.
-- client_email is now just an optional note for the owner's own
-- reference ("who did I send this to"), not an access mechanism.
create extension if not exists pgcrypto;

create table if not exists galleries (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  cover_path text,
  is_public boolean not null default false,
  access_token text not null unique default encode(gen_random_bytes(16), 'hex'),
  client_email text,
  owner_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);

alter table galleries enable row level security;

create policy "public galleries are readable by anyone"
  on galleries for select
  using (is_public = true);

create policy "owners can read their own galleries"
  on galleries for select
  using (auth.uid() = owner_id);

create policy "owners can create galleries"
  on galleries for insert
  with check (auth.uid() = owner_id and is_studio_owner());

create policy "owners can update their galleries"
  on galleries for update
  using (auth.uid() = owner_id and is_studio_owner())
  with check (auth.uid() = owner_id and is_studio_owner());

-- ── Photos ───────────────────────────────────────────────────────
-- Metadata only — the actual bytes live in R2 (the PHOTOS binding),
-- addressed by r2_key. Visibility mirrors the parent gallery.
create table if not exists photos (
  id uuid primary key default gen_random_uuid(),
  gallery_id uuid not null references galleries(id) on delete cascade,
  r2_key text not null,
  taken_at timestamptz,
  created_at timestamptz not null default now()
);

alter table photos enable row level security;

create policy "photos follow their gallery's visibility"
  on photos for select
  using (
    exists (
      select 1 from galleries
      where galleries.id = photos.gallery_id
        and (galleries.is_public = true or galleries.owner_id = auth.uid())
    )
  );

create policy "owners can add photos to their galleries"
  on photos for insert
  with check (
    exists (
      select 1 from galleries
      where galleries.id = photos.gallery_id
        and galleries.owner_id = auth.uid()
    )
    and is_studio_owner()
  );

-- ── Token-based client access ────────────────────────────────────
-- These three run as SECURITY DEFINER, meaning they execute with the
-- privileges of whoever defined them (not the anonymous caller), so
-- they can look up a gallery/photo by token without RLS blocking them
-- — and without the Worker ever needing a service-role key. The only
-- thing gating access is knowing the token itself. `stable` + a plain
-- `select` keeps each one a read-only, single-purpose lookup.
create or replace function gallery_by_token(token text)
returns table (id uuid, title text)
language sql
security definer
stable
as $$
  select id, title
  from galleries
  where access_token = token
$$;

create or replace function photos_by_gallery_token(token text)
returns table (id uuid, taken_at timestamptz)
language sql
security definer
stable
as $$
  select p.id, p.taken_at
  from photos p
  join galleries g on g.id = p.gallery_id
  where g.access_token = token
  order by p.taken_at asc nulls last, p.created_at asc
$$;

create or replace function photo_r2_key_by_token(token text, photo_id uuid)
returns text
language sql
security definer
stable
as $$
  select p.r2_key
  from photos p
  join galleries g on g.id = p.gallery_id
  where g.access_token = token and p.id = photo_id
  limit 1
$$;

grant execute on function gallery_by_token(text) to anon, authenticated;
grant execute on function photos_by_gallery_token(text) to anon, authenticated;
grant execute on function photo_r2_key_by_token(text, uuid) to anon, authenticated;
