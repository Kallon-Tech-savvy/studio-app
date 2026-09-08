-- ================================================================
-- PROOF STUDIO PLATFORM — PHASE 1 MULTI-TENANT & SECURITY HARDENED MIGRATION
-- Safe to execute against live Supabase environments.
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
using (public.is_studio_owner() or public.has_staff_permission('viewFinances'))
with check (public.is_studio_owner() or public.has_staff_permission('viewFinances'));

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
using (public.is_studio_owner() or public.has_staff_permission('manageStaff'));

drop policy if exists "staff can append activity_log" on public.activity_log;
create policy "staff can append activity_log"
on public.activity_log for insert to authenticated
with check (
  public.is_studio_owner()
  or public.has_staff_permission('manageStaff')
  or public.has_staff_permission('manageGalleries')
  or public.has_staff_permission('uploadPhotos')
  or public.has_staff_permission('viewFinances')
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
using (auth.uid() = owner_id or public.is_studio_owner() or public.has_staff_permission('manageGalleries'))
with check (auth.uid() = owner_id or public.is_studio_owner() or public.has_staff_permission('manageGalleries'));

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
      and (g.owner_id = auth.uid() or public.is_studio_owner() or public.has_staff_permission('manageGalleries'))
  )
);

create table if not exists public.curation_lists (
  id uuid primary key default gen_random_uuid(),
  gallery_id uuid not null references public.galleries(id) on delete cascade,
  name text not null default 'Favorites',
  selection_limit integer,
  created_at timestamptz not null default now()
);

alter table public.curation_lists enable row level security;

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

alter table public.curation_items enable row level security;

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
      and (g.owner_id = auth.uid() or public.is_studio_owner() or public.has_staff_permission('manageGalleries') or public.has_staff_permission('uploadPhotos'))
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
