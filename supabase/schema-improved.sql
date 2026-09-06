-- ================================================================
-- MJ PHOTOSHOOT / STUDIO APP - PRODUCTION DATABASE SCHEMA
-- ENHANCED WITH PERFORMANCE, AUDITING, AND BUSINESS LOGIC
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
-- 2. AUDIT LOG (Track all changes)
-- ================================================================

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  table_name text not null,
  record_id uuid,
  old_values jsonb,
  new_values jsonb,
  details text,
  ip_address inet,
  user_agent text,
  status text not null default 'success',
  error_message text,
  created_at timestamptz not null default now()
);

create index idx_audit_log_actor_id on public.audit_log(actor_id);
create index idx_audit_log_table_name on public.audit_log(table_name);
create index idx_audit_log_record_id on public.audit_log(record_id);
create index idx_audit_log_created_at on public.audit_log(created_at desc);

alter table public.audit_log enable row level security;

drop policy if exists "staff can read audit logs" on public.audit_log;
create policy "staff can read audit logs"
on public.audit_log
for select
to authenticated
using (
  public.is_studio_owner()
  or public.has_staff_permission('manageStaff')
);

-- ================================================================
-- 3. STUDIO SETTINGS (Global configuration)
-- ================================================================

create table if not exists public.studio_settings (
  id uuid primary key default gen_random_uuid(),
  studio_name text not null default 'My Studio',
  studio_email text,
  studio_phone text,
  logo_url text,
  watermark_text text,
  currency text not null default 'USD',
  timezone text not null default 'UTC',
  default_download_limit integer default 100,
  default_selection_limit integer default 50,
  smtp_enabled boolean not null default false,
  smtp_host text,
  smtp_port integer,
  smtp_user text,
  smtp_password_encrypted text,
  webhook_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.studio_settings enable row level security;

drop policy if exists "staff can read studio settings" on public.studio_settings;
create policy "staff can read studio settings"
on public.studio_settings
for select
to authenticated
using (
  public.has_staff_permission('manageGalleries')
  or public.is_studio_owner()
);

-- ================================================================
-- 4. STAFF WITH ENHANCED TRACKING
-- ================================================================

create table if not exists public.studio_staff (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null default '',
  role text not null default 'assistant'
    check (role in ('owner', 'admin', 'photographer', 'assistant', 'client')),

  permissions jsonb not null default '{
    "manageGalleries": false,
    "uploadPhotos": false,
    "manageStaff": false,
    "viewFinances": false,
    "viewReports": false,
    "deleteContent": false
  }'::jsonb,

  is_active boolean not null default true,
  experience_points integer not null default 0,
  current_streak integer not null default 0,
  galleries_published integer not null default 0,
  photos_uploaded integer not null default 0,
  last_activity_date timestamptz,

  -- Profile info
  avatar_url text,
  bio text,
  phone text,

  -- Settings
  email_notifications boolean not null default true,
  dark_mode boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz,
  deleted_at timestamptz
);

create index idx_studio_staff_user_id on public.studio_staff(user_id);
create index idx_studio_staff_email on public.studio_staff(email);
create index idx_studio_staff_role on public.studio_staff(role);
create index idx_studio_staff_is_active on public.studio_staff(is_active);

alter table public.studio_staff enable row level security;

drop policy if exists "staff can read their own profile" on public.studio_staff;
drop policy if exists "owners can manage all staff" on public.studio_staff;

create policy "staff can read their own profile"
on public.studio_staff
for select
to authenticated
using (
  auth.uid() = user_id
  or public.is_studio_owner()
  or public.has_staff_permission('manageStaff')
);

create policy "owners can manage all staff"
on public.studio_staff
for all
to authenticated
using (public.is_studio_owner())
with check (public.is_studio_owner());

-- ================================================================
-- 5. AUTHORIZATION HELPERS (Security Definer Functions)
-- ================================================================

drop function if exists public.is_bootstrap_owner(text) cascade;
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

drop function if exists public.is_studio_owner() cascade;
create or replace function public.is_studio_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.studio_staff ss
    where ss.user_id = auth.uid()
      and ss.role = 'owner'
      and ss.is_active = true
      and ss.deleted_at is null
  );
$$;

drop function if exists public.has_staff_permission(text) cascade;
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
      select 1 from public.studio_staff ss
      where ss.user_id = auth.uid()
        and ss.is_active = true
        and ss.deleted_at is null
        and coalesce((ss.permissions ->> permission_name)::boolean, false)
    );
$$;

drop function if exists public.has_staff_role(text) cascade;
create or replace function public.has_staff_role(role_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.studio_staff ss
    where ss.user_id = auth.uid()
      and ss.role = role_name
      and ss.is_active = true
      and ss.deleted_at is null
  );
$$;

revoke all on function public.is_studio_owner() from public, anon, authenticated;
revoke all on function public.has_staff_permission(text) from public, anon, authenticated;
revoke all on function public.has_staff_role(text) from public, anon, authenticated;

grant execute on function public.is_studio_owner() to authenticated;
grant execute on function public.has_staff_permission(text) to authenticated;
grant execute on function public.has_staff_role(text) to authenticated;

-- ================================================================
-- 6. CLIENTS WITH ENHANCED TRACKING
-- ================================================================

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  phone text,
  address text,
  city text,
  state text,
  zip text,
  country text,
  notes text,

  -- Payment tracking
  total_amount numeric(12, 2) not null default 0 check (total_amount >= 0),
  amount_paid numeric(12, 2) not null default 0 check (amount_paid >= 0),
  tax_rate numeric(5, 2) not null default 0 check (tax_rate >= 0),

  -- Status
  is_active boolean not null default true,
  
  -- Metadata
  custom_fields jsonb,
  tags text[],
  
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index idx_clients_email on public.clients(email);
create index idx_clients_name on public.clients(name);
create index idx_clients_is_active on public.clients(is_active);
create index idx_clients_created_at on public.clients(created_at);

alter table public.clients enable row level security;

drop policy if exists "finance staff can read clients" on public.clients;
drop policy if exists "finance staff can create clients" on public.clients;
drop policy if exists "finance staff can update clients" on public.clients;
drop policy if exists "finance staff can delete clients" on public.clients;

create policy "finance staff can read clients"
on public.clients
for select
to authenticated
using (
  public.is_studio_owner()
  or public.has_staff_permission('viewFinances')
);

create policy "finance staff can create clients"
on public.clients
for insert
to authenticated
with check (
  public.is_studio_owner()
  or public.has_staff_permission('viewFinances')
);

create policy "finance staff can update clients"
on public.clients
for update
to authenticated
using (
  public.is_studio_owner()
  or public.has_staff_permission('viewFinances')
)
with check (
  public.is_studio_owner()
  or public.has_staff_permission('viewFinances')
);

create policy "finance staff can delete clients"
on public.clients
for delete
to authenticated
using (
  public.is_studio_owner()
  or public.has_staff_permission('viewFinances')
);

-- ================================================================
-- 7. GALLERIES WITH ENHANCED FEATURES
-- ================================================================

create table if not exists public.galleries (
  id uuid primary key default gen_random_uuid(),

  -- Metadata
  title text not null,
  description text,
  cover_path text,

  -- Status & visibility
  status text not null default 'DRAFT'
    check (status in ('DRAFT', 'READY', 'PUBLISHED', 'ARCHIVED', 'DISABLED')),
  is_public boolean not null default false,

  -- Feature flags
  downloads_enabled boolean not null default true,
  selection_enabled boolean not null default true,
  watermark_enabled boolean not null default false,
  share_enabled boolean not null default true,
  password_protected boolean not null default false,
  password_hash text,

  -- Dates
  event_date timestamptz not null default now(),
  expiration_date timestamptz,
  
  -- Access control
  access_token text not null unique default encode(gen_random_bytes(16), 'hex'),
  
  -- Client & Financial
  client_id uuid references public.clients(id) on delete set null,
  client_email text,
  total_amount numeric(12, 2) not null default 0 check (total_amount >= 0),
  amount_paid numeric(12, 2) not null default 0 check (amount_paid >= 0),
  tax_rate numeric(5, 2) not null default 0 check (tax_rate >= 0),

  -- Settings
  max_downloads integer default 0,
  max_selections integer default 0,
  allow_comments boolean not null default false,
  allow_ratings boolean not null default false,

  -- Ownership & tracking
  owner_id uuid references auth.users(id) on delete set null,
  view_count integer not null default 0,
  
  -- Metadata
  custom_fields jsonb,
  tags text[],

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  deleted_at timestamptz
);

create index idx_galleries_owner_id on public.galleries(owner_id);
create index idx_galleries_client_id on public.galleries(client_id);
create index idx_galleries_status on public.galleries(status);
create index idx_galleries_is_public on public.galleries(is_public);
create index idx_galleries_access_token on public.galleries(access_token);
create index idx_galleries_created_at on public.galleries(created_at);
create index idx_galleries_expiration_date on public.galleries(expiration_date);

alter table public.galleries enable row level security;

drop policy if exists "staff can read galleries they manage or own" on public.galleries;
drop policy if exists "staff with gallery permission can create galleries" on public.galleries;
drop policy if exists "owners and managers can update galleries" on public.galleries;
drop policy if exists "owners and managers can delete galleries" on public.galleries;

create policy "staff can read galleries they manage or own"
on public.galleries
for select
to authenticated
using (
  auth.uid() = owner_id
  or public.is_studio_owner()
  or public.has_staff_permission('manageGalleries')
);

create policy "staff with gallery permission can create galleries"
on public.galleries
for insert
to authenticated
with check (
  (auth.uid() = owner_id or owner_id is null)
  and (
    public.is_studio_owner()
    or public.has_staff_permission('manageGalleries')
  )
);

create policy "owners and managers can update galleries"
on public.galleries
for update
to authenticated
using (
  auth.uid() = owner_id
  or public.is_studio_owner()
  or public.has_staff_permission('manageGalleries')
)
with check (
  auth.uid() = owner_id
  or public.is_studio_owner()
  or public.has_staff_permission('manageGalleries')
);

create policy "owners and managers can delete galleries"
on public.galleries
for delete
to authenticated
using (
  auth.uid() = owner_id
  or public.is_studio_owner()
  or public.has_staff_permission('manageGalleries')
);

-- ================================================================
-- 8. ALBUMS
-- ================================================================

create table if not exists public.albums (
  id uuid primary key default gen_random_uuid(),
  gallery_id uuid not null references public.galleries(id) on delete cascade,
  name text not null,
  description text,
  cover_photo_id uuid,
  sort_order integer not null default 0,
  photo_count integer not null default 0,
  total_size bigint not null default 0,
  custom_fields jsonb,
  
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_albums_gallery_id on public.albums(gallery_id);
create index idx_albums_sort_order on public.albums(gallery_id, sort_order);

alter table public.albums enable row level security;

drop policy if exists "staff can read managed albums" on public.albums;
drop policy if exists "staff can create albums" on public.albums;
drop policy if exists "staff can update albums" on public.albums;
drop policy if exists "staff can delete albums" on public.albums;

create policy "staff can read managed albums"
on public.albums
for select
to authenticated
using (
  exists (
    select 1 from public.galleries g
    where g.id = albums.gallery_id
      and (
        g.owner_id = auth.uid()
        or public.is_studio_owner()
        or public.has_staff_permission('manageGalleries')
      )
  )
);

create policy "staff can create albums"
on public.albums
for insert
to authenticated
with check (
  exists (
    select 1 from public.galleries g
    where g.id = albums.gallery_id
      and (
        g.owner_id = auth.uid()
        or public.is_studio_owner()
        or public.has_staff_permission('manageGalleries')
      )
  )
);

create policy "staff can update albums"
on public.albums
for update
to authenticated
using (
  exists (
    select 1 from public.galleries g
    where g.id = albums.gallery_id
      and (
        g.owner_id = auth.uid()
        or public.is_studio_owner()
        or public.has_staff_permission('manageGalleries')
      )
  )
)
with check (
  exists (
    select 1 from public.galleries g
    where g.id = albums.gallery_id
      and (
        g.owner_id = auth.uid()
        or public.is_studio_owner()
        or public.has_staff_permission('manageGalleries')
      )
  )
);

create policy "staff can delete albums"
on public.albums
for delete
to authenticated
using (
  exists (
    select 1 from public.galleries g
    where g.id = albums.gallery_id
      and (
        g.owner_id = auth.uid()
        or public.is_studio_owner()
        or public.has_staff_permission('manageGalleries')
      )
  )
);

-- ================================================================
-- 9. PHOTOS WITH ENHANCED METADATA
-- ================================================================

create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  gallery_id uuid not null references public.galleries(id) on delete cascade,
  album_id uuid references public.albums(id) on delete set null,

  -- Storage references
  r2_key text not null unique,
  preview_r2_key text unique,
  thumbnail_r2_key text unique,

  -- Metadata
  filename text,
  sort_order integer not null default 0,
  size bigint,
  mime_type text,
  width integer,
  height integer,
  duration_seconds numeric,

  -- Photo info
  taken_at timestamptz,
  camera_model text,
  lens_model text,
  iso integer,
  aperture text,
  shutter_speed text,
  focal_length text,
  location_lat numeric,
  location_lng numeric,

  -- Status & tracking
  is_marked boolean not null default false,
  download_count integer not null default 0,
  view_count integer not null default 0,
  
  -- Custom data
  custom_fields jsonb,
  tags text[],

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_photos_gallery_id on public.photos(gallery_id);
create index idx_photos_album_id on public.photos(album_id);
create index idx_photos_r2_key on public.photos(r2_key);
create index idx_photos_sort_order on public.photos(gallery_id, sort_order);
create index idx_photos_is_marked on public.photos(gallery_id, is_marked);
create index idx_photos_taken_at on public.photos(taken_at);

alter table public.photos enable row level security;

drop policy if exists "staff can read managed gallery photos" on public.photos;
drop policy if exists "staff with upload permission can add photos" on public.photos;
drop policy if exists "staff with upload permission can update photos" on public.photos;
drop policy if exists "staff with upload permission can delete photos" on public.photos;

create policy "staff can read managed gallery photos"
on public.photos
for select
to authenticated
using (
  exists (
    select 1 from public.galleries g
    where g.id = photos.gallery_id
      and (
        g.owner_id = auth.uid()
        or public.is_studio_owner()
        or public.has_staff_permission('manageGalleries')
        or public.has_staff_permission('uploadPhotos')
      )
  )
);

create policy "staff with upload permission can add photos"
on public.photos
for insert
to authenticated
with check (
  exists (
    select 1 from public.galleries g
    where g.id = photos.gallery_id
      and (
        g.owner_id = auth.uid()
        or public.is_studio_owner()
        or public.has_staff_permission('manageGalleries')
        or public.has_staff_permission('uploadPhotos')
      )
  )
);

create policy "staff with upload permission can update photos"
on public.photos
for update
to authenticated
using (
  exists (
    select 1 from public.galleries g
    where g.id = photos.gallery_id
      and (
        g.owner_id = auth.uid()
        or public.is_studio_owner()
        or public.has_staff_permission('manageGalleries')
        or public.has_staff_permission('uploadPhotos')
      )
  )
)
with check (
  exists (
    select 1 from public.galleries g
    where g.id = photos.gallery_id
      and (
        g.owner_id = auth.uid()
        or public.is_studio_owner()
        or public.has_staff_permission('manageGalleries')
        or public.has_staff_permission('uploadPhotos')
      )
  )
);

create policy "staff with upload permission can delete photos"
on public.photos
for delete
to authenticated
using (
  exists (
    select 1 from public.galleries g
    where g.id = photos.gallery_id
      and (
        g.owner_id = auth.uid()
        or public.is_studio_owner()
        or public.has_staff_permission('manageGalleries')
        or public.has_staff_permission('uploadPhotos')
      )
  )
);

-- ================================================================
-- 10. CLIENT SELECTIONS (Marked photos)
-- ================================================================

create table if not exists public.selections (
  id uuid primary key default gen_random_uuid(),
  gallery_id uuid not null references public.galleries(id) on delete cascade,
  photo_id uuid not null references public.photos(id) on delete cascade,
  
  -- Selection metadata
  selected_by_client boolean not null default false,
  selected_at timestamptz,
  
  -- Approval workflow
  approved boolean not null default false,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  
  -- Notes
  notes text,
  
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  
  unique(gallery_id, photo_id)
);

create index idx_selections_gallery_id on public.selections(gallery_id);
create index idx_selections_photo_id on public.selections(photo_id);
create index idx_selections_selected_by_client on public.selections(gallery_id, selected_by_client);
create index idx_selections_approved on public.selections(gallery_id, approved);

alter table public.selections enable row level security;

drop policy if exists "staff can manage selections" on public.selections;
create policy "staff can manage selections"
on public.selections
for all
to authenticated
using (
  exists (
    select 1 from public.galleries g
    where g.id = selections.gallery_id
      and (
        g.owner_id = auth.uid()
        or public.is_studio_owner()
        or public.has_staff_permission('manageGalleries')
      )
  )
)
with check (
  exists (
    select 1 from public.galleries g
    where g.id = selections.gallery_id
      and (
        g.owner_id = auth.uid()
        or public.is_studio_owner()
        or public.has_staff_permission('manageGalleries')
      )
  )
);

-- ================================================================
-- 11. PAYMENTS & INVOICES
-- ================================================================

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  
  -- Reference
  client_id uuid references public.clients(id) on delete set null,
  gallery_id uuid references public.galleries(id) on delete set null,
  
  -- Amount
  amount numeric(12, 2) not null check (amount > 0),
  currency text not null default 'USD',
  tax_amount numeric(12, 2) default 0,
  
  -- Payment details
  payment_method text not null
    check (payment_method in ('credit_card', 'bank_transfer', 'check', 'cash', 'paypal', 'stripe')),
  payment_status text not null default 'pending'
    check (payment_status in ('pending', 'completed', 'failed', 'refunded')),
  
  -- Transaction
  transaction_id text unique,
  reference_number text unique,
  notes text,
  
  -- Metadata
  metadata jsonb,
  
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  recorded_by uuid references auth.users(id) on delete set null
);

create index idx_payments_client_id on public.payments(client_id);
create index idx_payments_gallery_id on public.payments(gallery_id);
create index idx_payments_payment_status on public.payments(payment_status);
create index idx_payments_created_at on public.payments(created_at);

alter table public.payments enable row level security;

create policy "finance staff can manage payments"
on public.payments
for all
to authenticated
using (
  public.is_studio_owner()
  or public.has_staff_permission('viewFinances')
)
with check (
  public.is_studio_owner()
  or public.has_staff_permission('viewFinances')
);

-- ================================================================
-- 12. ACTIVITY LOG (Track operations)
-- ================================================================

create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text,
  entity_id uuid,
  details jsonb,
  created_at timestamptz not null default now()
);

create index idx_activity_log_user_id on public.activity_log(user_id);
create index idx_activity_log_entity_type on public.activity_log(entity_type);
create index idx_activity_log_entity_id on public.activity_log(entity_id);
create index idx_activity_log_created_at on public.activity_log(created_at);

alter table public.activity_log enable row level security;

drop policy if exists "staff can read activity log" on public.activity_log;
drop policy if exists "staff can append activity log" on public.activity_log;

create policy "staff can read activity log"
on public.activity_log
for select
to authenticated
using (
  public.is_studio_owner()
  or public.has_staff_permission('manageStaff')
);

create policy "staff can append activity log"
on public.activity_log
for insert
to authenticated
with check (
  public.is_studio_owner()
  or public.has_staff_permission('manageStaff')
  or public.has_staff_permission('manageGalleries')
  or public.has_staff_permission('uploadPhotos')
);

-- ================================================================
-- 13. NOTIFICATIONS
-- ================================================================

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null
    check (type in ('gallery_ready', 'selection_marked', 'payment_received', 'gallery_expired', 'invitation', 'system')),
  title text not null,
  message text,
  related_entity_id uuid,
  action_url text,
  is_read boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_notifications_user_id on public.notifications(user_id);
create index idx_notifications_is_read on public.notifications(user_id, is_read);
create index idx_notifications_created_at on public.notifications(user_id, created_at desc);

alter table public.notifications enable row level security;

create policy "users can read their own notifications"
on public.notifications
for select
to authenticated
using (auth.uid() = user_id);

create policy "users can update their own notifications"
on public.notifications
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- ================================================================
-- 14. PUBLIC GALLERY ACCESS
-- ================================================================

drop function if exists public.public_galleries();

create or replace function public.public_galleries()
returns table (
  id uuid,
  title text,
  cover_path text,
  access_token text,
  event_date timestamptz
)
language sql
security definer
stable
set search_path = public
as $$
  select
    g.id,
    g.title,
    g.cover_path,
    g.access_token,
    g.event_date
  from public.galleries g
  where g.is_public = true
    and g.status in ('READY', 'PUBLISHED')
    and g.deleted_at is null
    and (g.expiration_date is null or g.expiration_date > now())
  order by g.created_at desc;
$$;

revoke all on function public.public_galleries() from public, anon, authenticated;
grant execute on function public.public_galleries() to anon, authenticated;

-- ================================================================
-- 15. TOKEN-BASED CLIENT ACCESS
-- ================================================================

drop function if exists public.gallery_by_token(text);

create or replace function public.gallery_by_token(token text)
returns table (
  id uuid,
  title text,
  description text,
  cover_path text,
  status text,
  downloads_enabled boolean,
  selection_enabled boolean,
  watermark_enabled boolean,
  event_date timestamptz,
  expiration_date timestamptz,
  client_id uuid,
  total_amount numeric,
  amount_paid numeric,
  client_name text,
  allow_comments boolean,
  allow_ratings boolean
)
language sql
security definer
stable
set search_path = public
as $$
  select
    g.id,
    g.title,
    g.description,
    g.cover_path,
    g.status,
    g.downloads_enabled,
    g.selection_enabled,
    g.watermark_enabled,
    g.event_date,
    g.expiration_date,
    g.client_id,
    g.total_amount,
    g.amount_paid,
    c.name as client_name,
    g.allow_comments,
    g.allow_ratings
  from public.galleries g
  left join public.clients c on c.id = g.client_id
  where g.access_token = token
    and g.status not in ('DISABLED', 'ARCHIVED')
    and g.deleted_at is null
    and (g.expiration_date is null or g.expiration_date > now())
  limit 1;
$$;

revoke all on function public.gallery_by_token(text) from public, anon, authenticated;
grant execute on function public.gallery_by_token(text) to anon, authenticated;

drop function if exists public.albums_by_gallery_token(text);

create or replace function public.albums_by_gallery_token(token text)
returns table (
  id uuid,
  gallery_id uuid,
  name text,
  description text,
  cover_photo_id uuid,
  sort_order integer,
  photo_count integer
)
language sql
security definer
stable
set search_path = public
as $$
  select
    a.id,
    a.gallery_id,
    a.name,
    a.description,
    a.cover_photo_id,
    a.sort_order,
    a.photo_count
  from public.albums a
  join public.galleries g on g.id = a.gallery_id
  where g.access_token = token
    and g.status not in ('DISABLED', 'ARCHIVED')
    and g.deleted_at is null
    and (g.expiration_date is null or g.expiration_date > now())
  order by a.sort_order asc, a.created_at asc;
$$;

revoke all on function public.albums_by_gallery_token(text) from public, anon, authenticated;
grant execute on function public.albums_by_gallery_token(text) to anon, authenticated;

drop function if exists public.photos_by_gallery_token(text);

create or replace function public.photos_by_gallery_token(token text)
returns table (
  id uuid,
  gallery_id uuid,
  album_id uuid,
  filename text,
  taken_at timestamptz,
  sort_order integer,
  size bigint,
  mime_type text,
  width integer,
  height integer,
  is_marked boolean
)
language sql
security definer
stable
set search_path = public
as $$
  select
    p.id,
    p.gallery_id,
    p.album_id,
    p.filename,
    p.taken_at,
    p.sort_order,
    p.size,
    p.mime_type,
    p.width,
    p.height,
    p.is_marked
  from public.photos p
  join public.galleries g on g.id = p.gallery_id
  where g.access_token = token
    and g.status not in ('DISABLED', 'ARCHIVED')
    and g.deleted_at is null
    and (g.expiration_date is null or g.expiration_date > now())
  order by p.sort_order asc, p.created_at asc;
$$;

revoke all on function public.photos_by_gallery_token(text) from public, anon, authenticated;
grant execute on function public.photos_by_gallery_token(text) to anon, authenticated;

drop function if exists public.photo_preview_r2_key_by_token(text, uuid);

create or replace function public.photo_preview_r2_key_by_token(token text, photo_id uuid)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select p.preview_r2_key
  from public.photos p
  join public.galleries g on g.id = p.gallery_id
  where p.id = photo_id
    and g.access_token = token
    and g.status not in ('DISABLED', 'ARCHIVED')
    and g.deleted_at is null
    and (g.expiration_date is null or g.expiration_date > now())
  limit 1;
$$;

revoke all on function public.photo_preview_r2_key_by_token(text, uuid) from public, anon, authenticated;
grant execute on function public.photo_preview_r2_key_by_token(text, uuid) to anon, authenticated;

drop function if exists public.photo_r2_key_by_token(text, uuid);

create or replace function public.photo_r2_key_by_token(token text, photo_id uuid)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select p.r2_key
  from public.photos p
  join public.galleries g on g.id = p.gallery_id
  where p.id = photo_id
    and g.access_token = token
    and g.status not in ('DISABLED', 'ARCHIVED')
    and g.deleted_at is null
    and (g.expiration_date is null or g.expiration_date > now())
  limit 1;
$$;

revoke all on function public.photo_r2_key_by_token(text, uuid) from public, anon, authenticated;
grant execute on function public.photo_r2_key_by_token(text, uuid) to anon, authenticated;

-- ================================================================
-- 16. ATOMIC MUTATIONS (Read-Modify-Write as single operation)
-- ================================================================

create or replace function public.get_or_create_staff_profile()
returns setof public.studio_staff
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_email text;
  v_role text := 'assistant';
  v_permissions jsonb := '{
    "manageGalleries": false,
    "uploadPhotos": false,
    "manageStaff": false,
    "viewFinances": false,
    "viewReports": false,
    "deleteContent": false
  }'::jsonb;
begin
  select lower(email) into v_user_email from auth.users where id = auth.uid();
  if v_user_email is null then
    return;
  end if;

  if public.is_bootstrap_owner(v_user_email) then
    v_role := 'owner';
    v_permissions := '{
      "manageGalleries": true,
      "uploadPhotos": true,
      "manageStaff": true,
      "viewFinances": true,
      "viewReports": true,
      "deleteContent": true
    }'::jsonb;
  end if;

  insert into public.studio_staff (
    user_id, email, full_name, role, permissions, is_active, last_login_at
  ) values (
    auth.uid(), v_user_email,
    coalesce(split_part(v_user_email, '@', 1), 'Staff'),
    v_role, v_permissions, true, now()
  )
  on conflict (user_id) do update set
    email = excluded.email,
    role = case when public.is_bootstrap_owner(v_user_email) then 'owner' else studio_staff.role end,
    permissions = case when public.is_bootstrap_owner(v_user_email) then '{
      "manageGalleries": true,
      "uploadPhotos": true,
      "manageStaff": true,
      "viewFinances": true,
      "viewReports": true,
      "deleteContent": true
    }'::jsonb else studio_staff.permissions end,
    is_active = true,
    updated_at = now(),
    last_login_at = now();

  return query select * from public.studio_staff where user_id = auth.uid();
end;
$$;

revoke all on function public.get_or_create_staff_profile() from public, anon, authenticated;
grant execute on function public.get_or_create_staff_profile() to authenticated;

create or replace function public.record_client_payment(
  p_client_id uuid,
  p_amount numeric,
  p_method text default 'cash'
)
returns public.payments
language plpgsql
set search_path = public
as $$
declare
  result public.payments;
  v_client public.clients;
begin
  if p_amount <= 0 then
    raise exception 'Payment amount must be positive';
  end if;

  -- Get client record and update amount_paid atomically
  update public.clients
  set amount_paid = amount_paid + p_amount,
      updated_at = now()
  where id = p_client_id
  returning * into v_client;

  if v_client.id is null then
    raise exception 'Client not found';
  end if;

  if v_client.amount_paid + p_amount > v_client.total_amount then
    raise exception 'Payment would exceed total amount owed';
  end if;

  -- Record payment transaction
  insert into public.payments (
    client_id, amount, payment_method, payment_status, recorded_by
  ) values (
    p_client_id, p_amount, p_method, 'completed', auth.uid()
  )
  returning * into result;

  return result;
end;
$$;

revoke all on function public.record_client_payment(uuid, numeric, text) from public, anon, authenticated;
grant execute on function public.record_client_payment(uuid, numeric, text) to authenticated;

create or replace function public.record_gallery_payment(
  p_gallery_id uuid,
  p_amount numeric,
  p_method text default 'cash'
)
returns public.payments
language plpgsql
set search_path = public
as $$
declare
  result public.payments;
  v_gallery public.galleries;
begin
  if p_amount <= 0 then
    raise exception 'Payment amount must be positive';
  end if;

  update public.galleries
  set amount_paid = amount_paid + p_amount,
      updated_at = now()
  where id = p_gallery_id
  returning * into v_gallery;

  if v_gallery.id is null then
    raise exception 'Gallery not found';
  end if;

  if v_gallery.amount_paid + p_amount > v_gallery.total_amount then
    raise exception 'Payment would exceed total amount owed';
  end if;

  insert into public.payments (
    gallery_id, amount, payment_method, payment_status, recorded_by
  ) values (
    p_gallery_id, p_amount, p_method, 'completed', auth.uid()
  )
  returning * into result;

  return result;
end;
$$;

revoke all on function public.record_gallery_payment(uuid, numeric, text) from public, anon, authenticated;
grant execute on function public.record_gallery_payment(uuid, numeric, text) to authenticated;

create or replace function public.award_staff_xp(p_staff_id uuid, p_amount int)
returns void
language sql
security definer
set search_path = public
as $$
  update public.studio_staff
  set experience_points = experience_points + p_amount,
      updated_at = now()
  where id = p_staff_id;
$$;

revoke all on function public.award_staff_xp(uuid, int) from public, anon, authenticated;
grant execute on function public.award_staff_xp(uuid, int) to authenticated;

create or replace function public.increment_galleries_published(p_staff_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.studio_staff
  set galleries_published = galleries_published + 1,
      updated_at = now()
  where id = p_staff_id;
$$;

revoke all on function public.increment_galleries_published(uuid) from public, anon, authenticated;
grant execute on function public.increment_galleries_published(uuid) to authenticated;

-- ================================================================
-- 17. TRIGGER FOR STAFF AUTO-CREATION
-- ================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := 'assistant';
  v_permissions jsonb := '{
    "manageGalleries": false,
    "uploadPhotos": false,
    "manageStaff": false,
    "viewFinances": false,
    "viewReports": false,
    "deleteContent": false
  }'::jsonb;
begin
  if public.is_bootstrap_owner(new.email) then
    v_role := 'owner';
    v_permissions := '{
      "manageGalleries": true,
      "uploadPhotos": true,
      "manageStaff": true,
      "viewFinances": true,
      "viewReports": true,
      "deleteContent": true
    }'::jsonb;
  end if;

  begin
    insert into public.studio_staff (
      user_id, email, full_name, role, permissions, last_login_at
    ) values (
      new.id,
      lower(trim(new.email)),
      coalesce(
        nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
        split_part(new.email, '@', 1)
      ),
      v_role,
      v_permissions,
      now()
    )
    on conflict (user_id) do update set
      email = excluded.email,
      role = case when public.is_bootstrap_owner(new.email) then 'owner' else studio_staff.role end,
      permissions = case when public.is_bootstrap_owner(new.email) then '{
        "manageGalleries": true,
        "uploadPhotos": true,
        "manageStaff": true,
        "viewFinances": true,
        "viewReports": true,
        "deleteContent": true
      }'::jsonb else studio_staff.permissions end,
      last_login_at = now();
  exception when others then
    null;
  end;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute procedure public.handle_new_user();

-- ================================================================
-- 18. MATERIALIZED VIEW: GALLERY STATS
-- ================================================================

create materialized view if not exists public.gallery_stats as
select
  g.id,
  g.title,
  count(distinct p.id) as photo_count,
  count(distinct a.id) as album_count,
  count(distinct s.id) as selection_count,
  g.view_count,
  g.download_count,
  g.created_at,
  g.published_at
from public.galleries g
left join public.photos p on p.gallery_id = g.id
left join public.albums a on a.gallery_id = g.id
left join public.selections s on s.gallery_id = g.id
where g.deleted_at is null
group by g.id, g.title, g.view_count, g.download_count, g.created_at, g.published_at;

create unique index idx_gallery_stats_id on public.gallery_stats(id);

-- ================================================================
-- 19. MATERIALIZED VIEW: CLIENT FINANCIALS
-- ================================================================

create materialized view if not exists public.client_financials as
select
  c.id,
  c.name,
  c.email,
  c.total_amount,
  c.amount_paid,
  (c.total_amount - c.amount_paid) as amount_due,
  count(distinct g.id) as gallery_count,
  count(distinct p.id) as photo_count,
  c.created_at
from public.clients c
left join public.galleries g on g.client_id = c.id and g.deleted_at is null
left join public.photos p on p.gallery_id = g.id
where c.deleted_at is null
group by c.id, c.name, c.email, c.total_amount, c.amount_paid, c.created_at;

create unique index idx_client_financials_id on public.client_financials(id);

-- ================================================================
-- 20. GRANT PUBLIC ACCESS TO VIEWS (Read-only)
-- ================================================================

grant select on public.gallery_stats to authenticated;
grant select on public.client_financials to authenticated;

-- ================================================================
-- 21. COMMENTS & DOCUMENTATION
-- ================================================================

comment on table public.studio_staff is 'Studio staff profiles with roles, permissions, and activity tracking';
comment on table public.galleries is 'Photo galleries with status tracking, client association, and financial data';
comment on table public.photos is 'Individual photos with metadata, EXIF data, and usage tracking';
comment on table public.selections is 'Photos marked/approved by clients for proofing workflow';
comment on table public.payments is 'Payment transactions for clients and galleries';
comment on table public.notifications is 'User notifications for gallery updates and approvals';
comment on table public.audit_log is 'Comprehensive audit trail of all system changes';

-- ================================================================
-- 22. CREATE EXTENSION FOR FULL TEXT SEARCH (Optional)
-- ================================================================

create extension if not exists pg_trgm;

-- Add full text search indexes
create index idx_galleries_title_search on public.galleries using gin(to_tsvector('english', title));
create index idx_galleries_description_search on public.galleries using gin(to_tsvector('english', description));
create index idx_clients_name_search on public.clients using gin(to_tsvector('english', name));

-- ================================================================
-- MIGRATION COMPLETE
-- ================================================================

-- Initialize studio settings if not exist
insert into public.studio_settings (studio_name, timezone)
select 'My Studio', 'UTC'
where not exists (select 1 from public.studio_settings);
