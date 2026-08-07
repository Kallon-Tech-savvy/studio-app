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

-- ── Galleries ────────────────────────────────────────────────────
-- One row per shoot. is_public drives the homepage list; everything
-- else is only visible to its owner.
create table if not exists galleries (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  cover_path text,
  is_public boolean not null default false,
  owner_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);

alter table galleries enable row level security;

create policy "public galleries are readable by anyone"
  on galleries for select
  using (is_public = true);

create policy "clients can read their own galleries"
  on galleries for select
  using (auth.uid() = owner_id);

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
