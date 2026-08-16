-- ================================================================
-- MJ PHOTOSHOOT / STUDIO APP
-- FINAL DATABASE SECURITY + AUTHORIZATION MIGRATION
-- ================================================================

create extension if not exists pgcrypto;

-- ================================================================
-- 1. HEARTBEAT
-- ================================================================

create table if not exists public.heartbeat (
  id uuid primary key default gen_random_uuid(),
  pinged_at timestamptz not null default now()
);

insert into public.heartbeat default values;

alter table public.heartbeat enable row level security;

drop policy if exists "heartbeat is readable by anyone"
  on public.heartbeat;

-- Do not expose heartbeat publicly.
-- Server-side Worker access should use the Supabase service role.
revoke all on public.heartbeat from anon;
revoke all on public.heartbeat from authenticated;


-- ================================================================
-- 2. STUDIO STAFF
-- ================================================================

create table if not exists public.studio_staff (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null unique
    references auth.users(id)
    on delete cascade,

  email text not null unique,

  full_name text not null default '',

  role text not null default 'assistant'
    check (
      role in (
        'owner',
        'admin',
        'photographer',
        'assistant'
      )
    ),

  permissions jsonb not null default '{
    "manageGalleries": false,
    "uploadPhotos": false,
    "manageStaff": false,
    "viewFinances": false
  }'::jsonb,

  is_active boolean not null default true,

  created_at timestamptz not null default now(),

  updated_at timestamptz not null default now()
);

alter table public.studio_staff enable row level security;


-- ================================================================
-- 3. STAFF AUTHORIZATION HELPERS
--
-- SECURITY DEFINER prevents RLS recursion when these functions
-- inspect studio_staff.
-- ================================================================

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
  );
$$;


create or replace function public.has_staff_permission(
  permission_name text
)
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
        and coalesce(
          (ss.permissions ->> permission_name)::boolean,
          false
        )
    );
$$;


create or replace function public.has_staff_role(
  role_name text
)
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
      and ss.role = role_name
      and ss.is_active = true
  );
$$;


revoke all on function public.is_studio_owner()
  from public, anon, authenticated;

revoke all on function public.has_staff_permission(text)
  from public, anon, authenticated;

revoke all on function public.has_staff_role(text)
  from public, anon, authenticated;

grant execute on function public.is_studio_owner()
  to authenticated;

grant execute on function public.has_staff_permission(text)
  to authenticated;

grant execute on function public.has_staff_role(text)
  to authenticated;


-- ================================================================
-- 4. STAFF RLS
-- ================================================================

drop policy if exists "staff can read their own profile"
  on public.studio_staff;

drop policy if exists "owners can manage all staff"
  on public.studio_staff;


create policy "staff can read their own profile"
on public.studio_staff
for select
to authenticated
using (
  auth.uid() = user_id
  or public.is_studio_owner()
);


create policy "owners can manage all staff"
on public.studio_staff
for all
to authenticated
using (
  public.is_studio_owner()
)
with check (
  public.is_studio_owner()
);


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
    "viewFinances": false
  }'::jsonb;
begin
  select lower(email) into v_user_email from auth.users where id = auth.uid();
  if v_user_email is null then
    return;
  end if;

  if v_user_email = 'alhajicmkallon01@gmail.com' then
    v_role := 'owner';
    v_permissions := '{
      "manageGalleries": true,
      "uploadPhotos": true,
      "manageStaff": true,
      "viewFinances": true
    }'::jsonb;
  end if;

  insert into public.studio_staff (
    user_id,
    email,
    full_name,
    role,
    permissions,
    is_active
  )
  values (
    auth.uid(),
    v_user_email,
    coalesce(split_part(v_user_email, '@', 1), 'Staff'),
    v_role,
    v_permissions,
    true
  )
  on conflict (user_id) do update set
    email = excluded.email,
    role = case when v_user_email = 'alhajicmkallon01@gmail.com' then 'owner' else studio_staff.role end,
    permissions = case when v_user_email = 'alhajicmkallon01@gmail.com' then '{
      "manageGalleries": true,
      "uploadPhotos": true,
      "manageStaff": true,
      "viewFinances": true
    }'::jsonb else studio_staff.permissions end,
    is_active = true,
    updated_at = now();

  return query select * from public.studio_staff where user_id = auth.uid();
end;
$$;

revoke all on function public.get_or_create_staff_profile() from public, anon, authenticated;
grant execute on function public.get_or_create_staff_profile() to authenticated;


create or replace function public.sync_owner_profile(owner_email text)
returns setof public.studio_staff
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_email text;
begin
  select lower(email) into v_user_email from auth.users where id = auth.uid();

  if v_user_email is null or v_user_email != lower(trim(owner_email)) then
    return query select * from public.studio_staff where user_id = auth.uid();
    return;
  end if;

  insert into public.studio_staff (
    user_id,
    email,
    full_name,
    role,
    permissions,
    is_active
  )
  values (
    auth.uid(),
    v_user_email,
    'Studio Owner',
    'owner',
    '{
      "manageGalleries": true,
      "uploadPhotos": true,
      "manageStaff": true,
      "viewFinances": true
    }'::jsonb,
    true
  )
  on conflict (user_id) do update set
    role = 'owner',
    permissions = '{
      "manageGalleries": true,
      "uploadPhotos": true,
      "manageStaff": true,
      "viewFinances": true
    }'::jsonb,
    is_active = true,
    updated_at = now();

  return query select * from public.studio_staff where user_id = auth.uid();
end;
$$;

revoke all on function public.sync_owner_profile(text)
  from public, anon, authenticated;

grant execute on function public.sync_owner_profile(text)
  to authenticated;


-- ================================================================
-- 5. AUTOMATIC STAFF PROFILE
-- ================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_owner boolean := false;
  v_role text := 'assistant';
  v_permissions jsonb := '{
    "manageGalleries": false,
    "uploadPhotos": false,
    "manageStaff": false,
    "viewFinances": false
  }'::jsonb;
begin
  if lower(trim(new.email)) = 'alhajicmkallon01@gmail.com' then
    v_role := 'owner';
    v_permissions := '{
      "manageGalleries": true,
      "uploadPhotos": true,
      "manageStaff": true,
      "viewFinances": true
    }'::jsonb;
  end if;

  begin
    insert into public.studio_staff (
      user_id,
      email,
      full_name,
      role,
      permissions
    )
    values (
      new.id,
      lower(trim(new.email)),
      coalesce(
        nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
        split_part(new.email, '@', 1)
      ),
      v_role,
      v_permissions
    )

    on conflict (user_id) do update set
      email = excluded.email,
      role = case when lower(trim(new.email)) = 'alhajicmkallon01@gmail.com' then 'owner' else studio_staff.role end,
      permissions = case when lower(trim(new.email)) = 'alhajicmkallon01@gmail.com' then '{
        "manageGalleries": true,
        "uploadPhotos": true,
        "manageStaff": true,
        "viewFinances": true
      }'::jsonb else studio_staff.permissions end;
  exception when others then
    -- Guarantee trigger never blocks auth user creation
    null;
  end;

  return new;
end;
$$;


drop trigger if exists on_auth_user_created
on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute procedure public.handle_new_user();


-- ================================================================
-- 5.5 CLIENTS, ALBUMS & ACTIVITY LOG TABLES
-- ================================================================

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  phone text,
  notes text,
  total_amount numeric not null default 0,
  amount_paid numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.clients enable row level security;

drop policy if exists "staff can manage clients" on public.clients;

create policy "staff can manage clients"
on public.clients
for all
to authenticated
using (
  public.is_studio_owner()
  or public.has_staff_permission('viewFinances')
  or public.has_staff_permission('manageGalleries')
)
with check (
  public.is_studio_owner()
  or public.has_staff_permission('viewFinances')
  or public.has_staff_permission('manageGalleries')
);


create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  details text not null,
  created_at timestamptz not null default now()
);

alter table public.activity_log enable row level security;

drop policy if exists "staff can manage activity_log" on public.activity_log;

create policy "staff can manage activity_log"
on public.activity_log
for all
to authenticated
using (true)
with check (true);


-- ================================================================
-- 6. GALLERIES
-- ================================================================

create table if not exists public.galleries (
  id uuid primary key default gen_random_uuid(),

  title text not null,
  description text,
  cover_path text,
  status text not null default 'DRAFT',
  downloads_enabled boolean not null default true,
  selection_enabled boolean not null default true,
  watermark_enabled boolean not null default false,
  event_date timestamptz not null default now(),
  expiration_date timestamptz,
  client_id uuid references public.clients(id) on delete set null,

  is_public boolean not null default false,

  access_token text not null unique
    default encode(gen_random_bytes(16), 'hex'),

  client_email text,

  owner_id uuid
    references auth.users(id),

  created_at timestamptz not null default now()
);

-- Safely add any columns if galleries table was created prior
alter table public.galleries add column if not exists description text;
alter table public.galleries add column if not exists status text not null default 'DRAFT';
alter table public.galleries add column if not exists downloads_enabled boolean not null default true;
alter table public.galleries add column if not exists selection_enabled boolean not null default true;
alter table public.galleries add column if not exists watermark_enabled boolean not null default false;
alter table public.galleries add column if not exists event_date timestamptz not null default now();
alter table public.galleries add column if not exists expiration_date timestamptz;
alter table public.galleries add column if not exists client_id uuid references public.clients(id) on delete set null;

alter table public.galleries enable row level security;


create table if not exists public.albums (
  id uuid primary key default gen_random_uuid(),
  gallery_id uuid not null references public.galleries(id) on delete cascade,
  name text not null,
  description text,
  cover_photo_id uuid,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.albums enable row level security;

drop policy if exists "staff can manage albums" on public.albums;

create policy "staff can manage albums"
on public.albums
for all
to authenticated
using (true)
with check (true);


-- Remove old policies before recreating them.

drop policy if exists "public galleries are readable by anyone"
on public.galleries;

drop policy if exists "staff can read galleries they manage or own"
on public.galleries;

drop policy if exists "staff with gallery permission can create galleries"
on public.galleries;

drop policy if exists "owners and managers can update galleries"
on public.galleries;


-- IMPORTANT:
-- Do NOT expose public galleries directly through table SELECT.
--
-- Public/client access happens through SECURITY DEFINER RPCs below.
--
-- Authenticated staff access remains available through RLS.

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
  auth.uid() = owner_id
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
-- 7. PHOTOS
-- ================================================================

create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),

  gallery_id uuid not null
    references public.galleries(id)
    on delete cascade,

  album_id uuid
    references public.albums(id)
    on delete set null,

  r2_key text not null,

  sort_order integer not null default 0,
  size bigint,
  mime_type text,

  taken_at timestamptz,

  created_at timestamptz not null default now()
);

alter table public.photos add column if not exists album_id uuid references public.albums(id) on delete set null;
alter table public.photos add column if not exists sort_order integer not null default 0;
alter table public.photos add column if not exists size bigint;
alter table public.photos add column if not exists mime_type text;

alter table public.photos enable row level security;


drop policy if exists "photos follow their gallery's visibility"
on public.photos;

drop policy if exists "staff with upload permission can add photos"
on public.photos;


create policy "staff can read managed gallery photos"
on public.photos
for select
to authenticated
using (
  exists (
    select 1
    from public.galleries g
    where g.id = photos.gallery_id
      and (
        g.owner_id = auth.uid()
        or public.is_studio_owner()
        or public.has_staff_permission('manageGalleries')
      )
  )
);


create policy "staff with upload permission can add photos"
on public.photos
for insert
to authenticated
with check (
  exists (
    select 1
    from public.galleries g
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
    select 1
    from public.galleries g
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
    select 1
    from public.galleries g
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
    select 1
    from public.galleries g
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
-- 8. PUBLIC GALLERY LIST
--
-- NEVER return access_token here.
-- ================================================================

create or replace function public.public_galleries()
returns table (
  id uuid,
  title text,
  cover_path text
)
language sql
security definer
stable
set search_path = public
as $$
  select
    g.id,
    g.title,
    g.cover_path
  from public.galleries g
  where g.is_public = true
  order by g.created_at desc;
$$;


revoke all on function public.public_galleries()
from public, anon, authenticated;

grant execute on function public.public_galleries()
to anon, authenticated;


-- ================================================================
-- 9. TOKEN-BASED CLIENT ACCESS RPCs
-- ================================================================

drop function if exists public.gallery_by_token(text);

-- 1. Fetch private gallery by access token (SECURITY DEFINER)
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
  client_name text
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
    coalesce(c.total_amount, 0) as total_amount,
    coalesce(c.amount_paid, 0) as amount_paid,
    c.name as client_name
  from public.galleries g
  left join public.clients c on c.id = g.client_id
  where g.access_token = token
    and g.status != 'DISABLED'
    and (g.expiration_date is null or g.expiration_date > now())
  limit 1;
$$;

revoke all on function public.gallery_by_token(text) from public, anon, authenticated;
grant execute on function public.gallery_by_token(text) to anon, authenticated;


-- 2. Fetch albums inside private gallery by token
create or replace function public.albums_by_gallery_token(token text)
returns table (
  id uuid,
  gallery_id uuid,
  name text,
  description text,
  cover_photo_id uuid,
  sort_order integer
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
    a.sort_order
  from public.albums a
  join public.galleries g on g.id = a.gallery_id
  where g.access_token = token
    and g.status != 'DISABLED'
    and (g.expiration_date is null or g.expiration_date > now())
  order by a.sort_order asc, a.created_at asc;
$$;

revoke all on function public.albums_by_gallery_token(text) from public, anon, authenticated;
grant execute on function public.albums_by_gallery_token(text) to anon, authenticated;


-- 3. Fetch photos inside private gallery by token
create or replace function public.photos_by_gallery_token(token text)
returns table (
  id uuid,
  gallery_id uuid,
  album_id uuid,
  r2_key text,
  taken_at timestamptz,
  sort_order integer,
  size bigint,
  mime_type text
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
    p.r2_key,
    p.taken_at,
    p.sort_order,
    p.size,
    p.mime_type
  from public.photos p
  join public.galleries g on g.id = p.gallery_id
  where g.access_token = token
    and g.status != 'DISABLED'
    and (g.expiration_date is null or g.expiration_date > now())
  order by p.sort_order asc, p.created_at asc;
$$;

revoke all on function public.photos_by_gallery_token(text) from public, anon, authenticated;
grant execute on function public.photos_by_gallery_token(text) to anon, authenticated;


-- 4. Fetch photo r2_key for private token streaming
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
    and g.status != 'DISABLED'
    and (g.expiration_date is null or g.expiration_date > now())
  limit 1;
$$;

revoke all on function public.photo_r2_key_by_token(text, uuid) from public, anon, authenticated;
grant execute on function public.photo_r2_key_by_token(text, uuid) to anon, authenticated;