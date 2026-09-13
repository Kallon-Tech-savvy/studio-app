-- ================================================================
-- PROOF STUDIO PLATFORM — PHASE 1 MULTI-TENANT & SECURITY HARDENED MIGRATION
-- Safe to execute against live Supabase environments.
--
-- This is now the single canonical schema file — schema-improved.sql
-- has been retired; its tenant-parameterization approach for the
-- staff-authorization helpers was folded into section 4 below instead
-- of living as a second, drifting copy of the schema.
--
-- RECONCILIATION GAP — read before assuming this file is complete:
-- worker/index.ts and worker/lib/supabase.ts call several RPCs that
-- are NOT defined anywhere in this file, which means they exist only
-- in the live Supabase project and were never committed here:
--   get_or_create_staff_profile()   (worker/lib/supabase.ts)
--   public_galleries()              (GET /api/galleries)
--   photos_by_gallery_token(token)  (GET /api/g/:token/photos)
--   albums_by_gallery_token(token)  (GET /api/g/:token/albums)
--   photo_r2_key_by_token(...)      (GET /api/g/:token/photos/:photoId)
--   photo_preview_r2_key_by_token(...) (same route, preview path)
--   award_staff_xp(...)             (gamification, referenced as
--                                     "schema.sql section 10" in a
--                                     comment that no longer matches
--                                     this file's section numbering)
--   increment_galleries_published(...)
-- These are SECURITY DEFINER functions touching auth/RLS-sensitive
-- logic, so this migration does not attempt to reconstruct them from
-- guesswork. Pull their real definitions from the live project
-- (Supabase Studio → Database → Functions → "Show definition", or
-- `supabase db dump --schema public`) and append them here so this
-- file actually matches what's running.
-- ================================================================

create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";

-- ================================================================
-- 1. HEARTBEAT (Health Check)
-- ================================================================

create table if not exists public.heartbeat (
  id uuid primary key default gen_random_uuid(),
  pinged_at timestamptz not null default now()
);

insert into public.heartbeat default values on conflict do nothing;

alter table public.heartbeat enable row level security;

revoke all on public.heartbeat from anon, authenticated;

-- ================================================================
-- 2. STUDIOS (TENANT REGISTRY - PHASE 1 SCAFFOLDING)
-- ================================================================

create table if not exists public.studios (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  logo_url text,
  primary_color text default '#c7cbd2',
  accent_color text default '#b08d57',
  staff_limit integer not null default 5,
  storage_limit_bytes bigint not null default 107374182400, -- 100 GB
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.studios enable row level security;

-- Seed default tenant for existing single-studio data
insert into public.studios (id, name, slug)
values ('00000000-0000-0000-0000-000000000001', 'MJ Photo Studio', 'mj-photo-studio')
on conflict (slug) do nothing;

-- (RLS policy for studios is defined at the end of section 4, below —
-- it needs the studio_staff table to exist first.)

-- ================================================================
-- 3. STUDIO STAFF
-- ================================================================

create table if not exists public.studio_staff (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid references public.studios(id) on delete cascade default '00000000-0000-0000-0000-000000000001',
  user_id uuid not null unique references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null default '',
  role text not null default 'assistant' check (role in ('owner', 'admin', 'photographer', 'assistant', 'client')),
  permissions jsonb not null default '{
    "manageGalleries": false,
    "uploadPhotos": false,
    "manageStaff": false,
    "viewFinances": false
  }'::jsonb,
  is_active boolean not null default true,
  experience_points integer not null default 0,
  current_streak integer not null default 0,
  galleries_published integer not null default 0,
  photos_uploaded integer not null default 0,
  last_activity_date timestamptz,
  avatar_url text,
  bio text,
  phone text,
  email_notifications boolean not null default true,
  dark_mode boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz,
  deleted_at timestamptz
);

-- Safely add missing columns to live databases
alter table public.studio_staff add column if not exists studio_id uuid references public.studios(id) on delete cascade default '00000000-0000-0000-0000-000000000001';
alter table public.studio_staff add column if not exists experience_points integer not null default 0;
alter table public.studio_staff add column if not exists current_streak integer not null default 0;
alter table public.studio_staff add column if not exists galleries_published integer not null default 0;
alter table public.studio_staff add column if not exists photos_uploaded integer not null default 0;
alter table public.studio_staff add column if not exists last_activity_date timestamptz;
alter table public.studio_staff add column if not exists avatar_url text;
alter table public.studio_staff add column if not exists bio text;
alter table public.studio_staff add column if not exists phone text;
alter table public.studio_staff add column if not exists email_notifications boolean not null default true;
alter table public.studio_staff add column if not exists dark_mode boolean not null default true;
alter table public.studio_staff add column if not exists last_login_at timestamptz;
alter table public.studio_staff add column if not exists deleted_at timestamptz;

-- Backfill studio_id
update public.studio_staff set studio_id = '00000000-0000-0000-0000-000000000001' where studio_id is null;

alter table public.studio_staff enable row level security;

-- (RLS policies for studio_staff are defined at the end of section 4,
-- below — they need is_studio_owner(uuid) to exist first.)

-- ================================================================
-- 4. STAFF AUTHORIZATION HELPERS (SECURITY DEFINER)
-- ================================================================

create or replace function public.is_bootstrap_owner(candidate_email text)
returns boolean
language sql
immutable
security definer
set search_path = public
as $$
  select lower(trim(candidate_email)) = 'alhajicmkallon01@gmail.com';
$$;

revoke all on function public.is_bootstrap_owner(text) from public, anon, authenticated;

create or replace function public.is_studio_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.studio_staff ss
    where ss.user_id = auth.uid()
      and ss.role = 'owner'
      and ss.is_active = true
      and ss.deleted_at is null
  );
$$;

create or replace function public.has_staff_permission(permission_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_studio_owner()
    or exists (
      select 1
      from public.studio_staff ss
      where ss.user_id = auth.uid()
        and ss.is_active = true
        and ss.deleted_at is null
        and coalesce((ss.permissions ->> permission_name)::boolean, false)
    );
$$;

revoke all on function public.is_studio_owner() from public, anon, authenticated;
revoke all on function public.has_staff_permission(text) from public, anon, authenticated;
grant execute on function public.is_studio_owner() to authenticated;
grant execute on function public.has_staff_permission(text) to authenticated;

-- Tenant-aware overloads (distinct arity, not a default parameter on
-- the functions above — a default would make e.g. has_staff_permission
-- callable with exactly one argument two different ways, which Postgres
-- rejects as an ambiguous call at every existing 1-arg call site). The
-- zero/one-arg forms above are untouched, so anything already calling
-- them — including the phantom RPCs noted at the top of this file —
-- keeps working unchanged. Every policy below that touches a specific
-- studio's row calls these scoped versions instead, so an owner or
-- staff member of one studio can no longer satisfy a check against
-- another studio's data purely by holding the 'owner' role somewhere.
create or replace function public.is_studio_owner(p_studio_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.studio_staff ss
    where ss.user_id = auth.uid()
      and ss.role = 'owner'
      and ss.is_active = true
      and ss.deleted_at is null
      and ss.studio_id = p_studio_id
  );
$$;

create or replace function public.has_staff_permission(permission_name text, p_studio_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_studio_owner(p_studio_id)
    or exists (
      select 1
      from public.studio_staff ss
      where ss.user_id = auth.uid()
        and ss.is_active = true
        and ss.deleted_at is null
        and ss.studio_id = p_studio_id
        and coalesce((ss.permissions ->> permission_name)::boolean, false)
    );
$$;

revoke all on function public.is_studio_owner(uuid) from public, anon, authenticated;
revoke all on function public.has_staff_permission(text, uuid) from public, anon, authenticated;
grant execute on function public.is_studio_owner(uuid) to authenticated;
grant execute on function public.has_staff_permission(text, uuid) to authenticated;

-- studio_staff was RLS-enabled with no committed policy at all. The
-- two policies below were reverse-engineered from comments already in
-- worker/index.ts describing behavior the live database evidently
-- already enforces ("RLS on studio_staff only lets a non-owner read
-- their own row"; "owners can manage all staff" / "the only RLS write
-- policy on studio_staff is owner-only") — named to match.
drop policy if exists "staff can view their own row" on public.studio_staff;
create policy "staff can view their own row"
on public.studio_staff for select to authenticated
using (user_id = auth.uid() or public.is_studio_owner(studio_staff.studio_id));

drop policy if exists "owners can manage all staff" on public.studio_staff;
create policy "owners can manage all staff"
on public.studio_staff for all to authenticated
using (public.is_studio_owner(studio_staff.studio_id))
with check (public.is_studio_owner(studio_staff.studio_id));

-- Nothing in the app queries `studios` directly today (gallery_by_token
-- reads it via a SECURITY DEFINER RPC, which bypasses RLS), but it was
-- RLS-enabled with zero policies, so any future direct read would
-- silently return no rows. This scopes read access to a staff member's
-- own studio ahead of that need.
drop policy if exists "staff can view their own studio" on public.studios;
create policy "staff can view their own studio"
on public.studios for select to authenticated
using (
  exists (
    select 1 from public.studio_staff ss
    where ss.studio_id = studios.id
      and ss.user_id = auth.uid()
      and ss.is_active = true
      and ss.deleted_at is null
  )
);

-- ================================================================
-- 5. CLIENTS
-- ================================================================

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid references public.studios(id) on delete cascade default '00000000-0000-0000-0000-000000000001',
  name text not null,
  email text,
  phone text,
  address text,
  city text,
  state text,
  zip text,
  country text,
  notes text,
  total_amount numeric(12, 2) not null default 0 check (total_amount >= 0),
  amount_paid numeric(12, 2) not null default 0 check (amount_paid >= 0),
  tax_rate numeric(5, 2) not null default 0 check (tax_rate >= 0),
  is_active boolean not null default true,
  custom_fields jsonb,
  tags text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Safely add missing columns to live databases
alter table public.clients add column if not exists studio_id uuid references public.studios(id) on delete cascade default '00000000-0000-0000-0000-000000000001';
alter table public.clients add column if not exists address text;
alter table public.clients add column if not exists city text;
alter table public.clients add column if not exists state text;
alter table public.clients add column if not exists zip text;
alter table public.clients add column if not exists country text;
alter table public.clients add column if not exists tax_rate numeric(5, 2) not null default 0;
alter table public.clients add column if not exists is_active boolean not null default true;
alter table public.clients add column if not exists custom_fields jsonb;
alter table public.clients add column if not exists tags text[];
alter table public.clients add column if not exists deleted_at timestamptz;

update public.clients set studio_id = '00000000-0000-0000-0000-000000000001' where studio_id is null;

alter table public.clients enable row level security;

drop policy if exists "finance staff can manage clients" on public.clients;
create policy "finance staff can manage clients"
on public.clients for all to authenticated
using (public.is_studio_owner(clients.studio_id) or public.has_staff_permission('viewFinances', clients.studio_id))
with check (public.is_studio_owner(clients.studio_id) or public.has_staff_permission('viewFinances', clients.studio_id));

-- ================================================================
-- 6. ACTIVITY LOG
-- ================================================================

create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid references public.studios(id) on delete cascade default '00000000-0000-0000-0000-000000000001',
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text,
  entity_id uuid,
  details text,
  created_at timestamptz not null default now()
);

alter table public.activity_log add column if not exists studio_id uuid references public.studios(id) on delete cascade default '00000000-0000-0000-0000-000000000001';
alter table public.activity_log add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.activity_log add column if not exists entity_type text;
alter table public.activity_log add column if not exists entity_id uuid;

update public.activity_log set studio_id = '00000000-0000-0000-0000-000000000001' where studio_id is null;

alter table public.activity_log enable row level security;

drop policy if exists "staff can read activity_log" on public.activity_log;
create policy "staff can read activity_log"
on public.activity_log for select to authenticated
using (public.is_studio_owner(activity_log.studio_id) or public.has_staff_permission('manageStaff', activity_log.studio_id));

drop policy if exists "staff can append activity_log" on public.activity_log;
create policy "staff can append activity_log"
on public.activity_log for insert to authenticated
with check (
  public.is_studio_owner(activity_log.studio_id)
  or public.has_staff_permission('manageStaff', activity_log.studio_id)
  or public.has_staff_permission('manageGalleries', activity_log.studio_id)
  or public.has_staff_permission('uploadPhotos', activity_log.studio_id)
  or public.has_staff_permission('viewFinances', activity_log.studio_id)
);

-- ================================================================
-- 7. GALLERIES, ALBUMS & CURATION LISTS
-- ================================================================

create table if not exists public.galleries (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid references public.studios(id) on delete cascade default '00000000-0000-0000-0000-000000000001',
  title text not null,
  description text,
  cover_path text,
  type text not null default 'proofing' check (type in ('proofing', 'delivery')),
  status text not null default 'DRAFT' check (status in ('DRAFT', 'PROCESSING', 'READY', 'PUBLISHED', 'DISABLED', 'ARCHIVED')),
  pin_code text,
  downloads_enabled boolean not null default true,
  selection_enabled boolean not null default true,
  watermark_enabled boolean not null default false,
  share_enabled boolean not null default true,
  password_protected boolean not null default false,
  password_hash text,
  selection_limit integer,
  extra_photo_price numeric default 0,
  allowed_download_sizes jsonb default '["web", "full"]'::jsonb,
  event_date timestamptz not null default now(),
  expiration_date timestamptz,
  client_id uuid references public.clients(id) on delete set null,
  is_public boolean not null default false,
  access_token text not null unique default encode(gen_random_bytes(16), 'hex'),
  client_email text,
  owner_id uuid references auth.users(id),
  total_amount numeric(12, 2) not null default 0 check (total_amount >= 0),
  amount_paid numeric(12, 2) not null default 0 check (amount_paid >= 0),
  tax_rate numeric(5, 2) not null default 0 check (tax_rate >= 0),
  max_downloads integer default 0,
  max_selections integer default 0,
  allow_comments boolean not null default false,
  allow_ratings boolean not null default false,
  view_count integer not null default 0,
  published_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Safely add missing columns to live databases
alter table public.galleries add column if not exists studio_id uuid references public.studios(id) on delete cascade default '00000000-0000-0000-0000-000000000001';
alter table public.galleries add column if not exists type text not null default 'proofing';
alter table public.galleries add column if not exists pin_code text;
alter table public.galleries add column if not exists share_enabled boolean not null default true;
alter table public.galleries add column if not exists password_protected boolean not null default false;
alter table public.galleries add column if not exists password_hash text;
alter table public.galleries add column if not exists selection_limit integer;
alter table public.galleries add column if not exists extra_photo_price numeric default 0;
alter table public.galleries add column if not exists allowed_download_sizes jsonb default '["web", "full"]'::jsonb;
alter table public.galleries add column if not exists tax_rate numeric(5, 2) not null default 0;
alter table public.galleries add column if not exists max_downloads integer default 0;
alter table public.galleries add column if not exists max_selections integer default 0;
alter table public.galleries add column if not exists allow_comments boolean not null default false;
alter table public.galleries add column if not exists allow_ratings boolean not null default false;
alter table public.galleries add column if not exists view_count integer not null default 0;
alter table public.galleries add column if not exists published_at timestamptz;
alter table public.galleries add column if not exists deleted_at timestamptz;

update public.galleries set studio_id = '00000000-0000-0000-0000-000000000001' where studio_id is null;

alter table public.galleries enable row level security;

drop policy if exists "staff can manage galleries" on public.galleries;
create policy "staff can manage galleries"
on public.galleries for all to authenticated
using (auth.uid() = owner_id or public.is_studio_owner(galleries.studio_id) or public.has_staff_permission('manageGalleries', galleries.studio_id))
with check (auth.uid() = owner_id or public.is_studio_owner(galleries.studio_id) or public.has_staff_permission('manageGalleries', galleries.studio_id));

create table if not exists public.albums (
  id uuid primary key default gen_random_uuid(),
  gallery_id uuid not null references public.galleries(id) on delete cascade,
  name text not null,
  description text,
  cover_photo_id uuid,
  sort_order integer not null default 0,
  photo_count integer not null default 0,
  total_size bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.albums add column if not exists photo_count integer not null default 0;
alter table public.albums add column if not exists total_size bigint not null default 0;

alter table public.albums enable row level security;

drop policy if exists "staff can manage albums" on public.albums;
create policy "staff can manage albums"
on public.albums for all to authenticated
using (
  exists (
    select 1 from public.galleries g
    where g.id = albums.gallery_id
      and (g.owner_id = auth.uid() or public.is_studio_owner(g.studio_id) or public.has_staff_permission('manageGalleries', g.studio_id))
  )
);

create table if not exists public.curation_lists (
  id uuid primary key default gen_random_uuid(),
  gallery_id uuid not null references public.galleries(id) on delete cascade,
  name text not null default 'Favorites',
  selection_limit integer,
  created_at timestamptz not null default now()
);

-- One list per (gallery, intent) — 'favorites' is the only intent the
-- client UI exposes today, but src/sync/selection.ts already types
-- 'final_delivery' | 'album_selection' | 'print_selection' too, so this
-- is sized for that rather than hard-coding a single Favorites list.
alter table public.curation_lists add column if not exists intent text not null default 'favorites'
  check (intent in ('favorites', 'final_delivery', 'album_selection', 'print_selection'));

-- No route in worker/index.ts reads or writes curation_lists/curation_items
-- today (only apply_gallery_selection_mutations() below does), so this
-- assumes no gallery already has more than one row here. If this repo
-- has been used to test-write curation_lists by hand outside the app,
-- this index creation will fail loudly rather than silently pick a
-- winner — resolve the duplicate row(s) for that gallery_id before
-- re-running.
create unique index if not exists idx_curation_lists_gallery_intent on public.curation_lists(gallery_id, intent);

alter table public.curation_lists enable row level security;

drop policy if exists "staff can manage curation lists" on public.curation_lists;
create policy "staff can manage curation lists"
on public.curation_lists for all to authenticated
using (
  exists (
    select 1 from public.galleries g
    where g.id = curation_lists.gallery_id
      and (g.owner_id = auth.uid() or public.is_studio_owner(g.studio_id) or public.has_staff_permission('manageGalleries', g.studio_id))
  )
);

create table if not exists public.curation_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.curation_lists(id) on delete cascade,
  photo_id uuid not null,
  note text,
  approved boolean,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  constraint curation_items_list_photo_unique unique (list_id, photo_id)
);

create index if not exists idx_curation_items_list_id on public.curation_items(list_id);
create index if not exists idx_curation_items_photo_id on public.curation_items(photo_id);

alter table public.curation_items enable row level security;

drop policy if exists "staff can manage curation items" on public.curation_items;
create policy "staff can manage curation items"
on public.curation_items for all to authenticated
using (
  exists (
    select 1 from public.curation_lists cl
    join public.galleries g on g.id = cl.gallery_id
    where cl.id = curation_items.list_id
      and (g.owner_id = auth.uid() or public.is_studio_owner(g.studio_id) or public.has_staff_permission('manageGalleries', g.studio_id))
  )
);

-- ================================================================
-- 8. PHOTOS
-- ================================================================

create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid references public.studios(id) on delete cascade default '00000000-0000-0000-0000-000000000001',
  gallery_id uuid not null references public.galleries(id) on delete cascade,
  album_id uuid references public.albums(id) on delete set null,
  r2_key text not null,
  preview_r2_key text,
  thumbnail_r2_key text,
  filename text,
  sort_order integer not null default 0,
  size bigint,
  mime_type text,
  width integer,
  height integer,
  taken_at timestamptz,
  revised_at timestamptz,
  is_marked boolean not null default false,
  download_count integer not null default 0,
  view_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.photos add column if not exists studio_id uuid references public.studios(id) on delete cascade default '00000000-0000-0000-0000-000000000001';
alter table public.photos add column if not exists thumbnail_r2_key text;
alter table public.photos add column if not exists filename text;
alter table public.photos add column if not exists width integer;
alter table public.photos add column if not exists height integer;
alter table public.photos add column if not exists revised_at timestamptz;
alter table public.photos add column if not exists is_marked boolean not null default false;
alter table public.photos add column if not exists download_count integer not null default 0;
alter table public.photos add column if not exists view_count integer not null default 0;

update public.photos set studio_id = '00000000-0000-0000-0000-000000000001' where studio_id is null;

alter table public.photos enable row level security;

drop policy if exists "staff can manage photos" on public.photos;
create policy "staff can manage photos"
on public.photos for all to authenticated
using (
  exists (
    select 1 from public.galleries g
    where g.id = photos.gallery_id
      and (g.owner_id = auth.uid() or public.is_studio_owner(g.studio_id) or public.has_staff_permission('manageGalleries', g.studio_id) or public.has_staff_permission('uploadPhotos', g.studio_id))
  )
);

-- ================================================================
-- 9. TOKEN-GATED CLIENT ACCESS RPCs (SECURITY DEFINER)
-- ================================================================

create or replace function public.gallery_by_token(token text)
returns table (
  id uuid,
  studio_id uuid,
  title text,
  description text,
  cover_path text,
  type text,
  status text,
  downloads_enabled boolean,
  selection_enabled boolean,
  watermark_enabled boolean,
  selection_limit integer,
  extra_photo_price numeric,
  allowed_download_sizes jsonb,
  pin_code text,
  event_date timestamptz,
  expiration_date timestamptz,
  client_id uuid,
  total_amount numeric,
  amount_paid numeric,
  client_name text,
  studio_name text,
  studio_logo_url text,
  primary_color text,
  accent_color text
)
language sql
security definer
stable
set search_path = public
as $$
  select
    g.id,
    g.studio_id,
    g.title,
    g.description,
    g.cover_path,
    g.type,
    g.status,
    g.downloads_enabled,
    g.selection_enabled,
    g.watermark_enabled,
    g.selection_limit,
    coalesce(g.extra_photo_price, 0),
    g.allowed_download_sizes,
    g.pin_code,
    g.event_date,
    g.expiration_date,
    g.client_id,
    coalesce(g.total_amount, 0) as total_amount,
    coalesce(g.amount_paid, 0) as amount_paid,
    c.name as client_name,
    s.name as studio_name,
    s.logo_url as studio_logo_url,
    s.primary_color,
    s.accent_color
  from public.galleries g
  join public.studios s on s.id = g.studio_id
  left join public.clients c on c.id = g.client_id
  where g.access_token = token
    and g.status not in ('DISABLED', 'ARCHIVED')
    and (g.expiration_date is null or g.expiration_date > now())
  limit 1;
$$;

revoke all on function public.gallery_by_token(text) from public, anon, authenticated;
grant execute on function public.gallery_by_token(text) to anon, authenticated;

-- ================================================================
-- 10. ATOMIC PAYMENT MUTATIONS (SECURITY DEFINER)
-- ================================================================

create or replace function public.record_client_payment(p_client_id uuid, p_amount numeric)
returns public.clients
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.clients;
begin
  if not (public.is_studio_owner() or public.has_staff_permission('viewFinances')) then
    raise exception 'Permission denied to record payments.';
  end if;

  if p_amount <= 0 then
    raise exception 'Payment amount must be positive.';
  end if;

  update public.clients
  set amount_paid = amount_paid + p_amount,
      updated_at = now()
  where id = p_client_id
  returning * into result;

  return result;
end;
$$;

create or replace function public.record_gallery_payment(p_gallery_id uuid, p_amount numeric)
returns public.galleries
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.galleries;
begin
  if not (public.is_studio_owner() or public.has_staff_permission('viewFinances') or public.has_staff_permission('manageGalleries')) then
    raise exception 'Permission denied to record payments.';
  end if;

  if p_amount <= 0 then
    raise exception 'Payment amount must be positive.';
  end if;

  update public.galleries
  set amount_paid = amount_paid + p_amount,
      updated_at = now()
  where id = p_gallery_id
  returning * into result;

  return result;
end;
$$;

revoke all on function public.record_client_payment(uuid, numeric) from public, anon, authenticated;
revoke all on function public.record_gallery_payment(uuid, numeric) from public, anon, authenticated;
grant execute on function public.record_client_payment(uuid, numeric) to authenticated;
grant execute on function public.record_gallery_payment(uuid, numeric) to authenticated;

-- ================================================================
-- 11. GALLERY SELECTION SYNC (SECURITY DEFINER, token-gated)
-- Backs POST /api/g/:token/selection/sync — replays the client's
-- offline outbox (src/sync/outbox.ts) into curation_items. Token-gated
-- like gallery_by_token above, not staff-authenticated, so every check
-- a normal authenticated write would get from RLS is done by hand here:
-- gallery must be live and not expired, selection_enabled must be true,
-- each photo_id must actually belong to this gallery, and selection_limit
-- (if set) is enforced per intent. Unknown mutation types or intents are
-- silently skipped rather than raising, so one bad entry in a batch
-- doesn't fail the rest of an offline queue's replay.
-- ================================================================

create or replace function public.apply_gallery_selection_mutations(p_token text, p_mutations jsonb)
returns table (selected_photo_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gallery record;
  v_mutation jsonb;
  v_photo_id uuid;
  v_intent text;
  v_type text;
  v_list_id uuid;
  v_current_count integer;
begin
  select g.id, g.selection_enabled, g.selection_limit
  into v_gallery
  from public.galleries g
  where g.access_token = p_token
    and g.status not in ('DISABLED', 'ARCHIVED')
    and (g.expiration_date is null or g.expiration_date > now())
  limit 1;

  if v_gallery.id is null then
    raise exception 'Gallery not found or inactive.';
  end if;

  if not v_gallery.selection_enabled then
    raise exception 'Selections are disabled for this gallery.';
  end if;

  if jsonb_typeof(p_mutations) is distinct from 'array' then
    raise exception 'Mutations payload must be an array.';
  end if;

  for v_mutation in select * from jsonb_array_elements(p_mutations)
  loop
    v_type := v_mutation ->> 'type';
    v_intent := coalesce(v_mutation -> 'payload' ->> 'intent', 'favorites');

    if v_type not in ('SELECT_PHOTO', 'UNSELECT_PHOTO') then
      continue;
    end if;

    if v_intent not in ('favorites', 'final_delivery', 'album_selection', 'print_selection') then
      continue;
    end if;

    begin
      v_photo_id := (v_mutation -> 'payload' ->> 'photoId')::uuid;
    exception when others then
      continue;
    end;

    if not exists (select 1 from public.photos p where p.id = v_photo_id and p.gallery_id = v_gallery.id) then
      continue;
    end if;

    insert into public.curation_lists (gallery_id, name, intent, selection_limit)
    values (v_gallery.id, initcap(replace(v_intent, '_', ' ')), v_intent, v_gallery.selection_limit)
    on conflict (gallery_id, intent) do nothing;

    select id into v_list_id
    from public.curation_lists
    where gallery_id = v_gallery.id and intent = v_intent
    limit 1;

    if v_type = 'SELECT_PHOTO' then
      if v_gallery.selection_limit is not null then
        select count(*) into v_current_count from public.curation_items where list_id = v_list_id;
        if v_current_count >= v_gallery.selection_limit
           and not exists (select 1 from public.curation_items ci where ci.list_id = v_list_id and ci.photo_id = v_photo_id) then
          continue;
        end if;
      end if;

      insert into public.curation_items (list_id, photo_id)
      values (v_list_id, v_photo_id)
      on conflict (list_id, photo_id) do nothing;
    else
      delete from public.curation_items ci where ci.list_id = v_list_id and ci.photo_id = v_photo_id;
    end if;
  end loop;

  return query
    select ci.photo_id as selected_photo_id
    from public.curation_items ci
    join public.curation_lists cl on cl.id = ci.list_id
    where cl.gallery_id = v_gallery.id;
end;
$$;

revoke all on function public.apply_gallery_selection_mutations(text, jsonb) from public, anon, authenticated;
grant execute on function public.apply_gallery_selection_mutations(text, jsonb) to anon, authenticated;

-- ================================================================
-- INDEXES FOR MULTI-TENANT QUERY OPTIMIZATION
-- ================================================================

create index if not exists idx_studio_staff_studio_id on public.studio_staff(studio_id);
create index if not exists idx_clients_studio_id on public.clients(studio_id);
create index if not exists idx_galleries_studio_id on public.galleries(studio_id);
create index if not exists idx_photos_studio_id on public.photos(studio_id);
create index if not exists idx_activity_log_studio_id on public.activity_log(studio_id);

-- ================================================================
-- MIGRATION COMPLETE
-- ================================================================