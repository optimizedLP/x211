-- x211 — schema, reference data, indexes and policies.
--
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- It is idempotent: running it twice is safe.
--
-- Design notes:
--   * Rooms and staff start empty. The importer creates them from the sheet.
--   * Categories are reference data (a device cannot exist without one).
--   * A removed device keeps its asset tag, so restoring it can never collide
--     with a tag imported in the meantime — the unique index covers deleted
--     rows too.
--   * RLS is on for every table. Signed-in admins can read and write, guests
--     can only read; the publishable key on its own gets nothing.
--   * The role lives in `profiles`, not in user metadata: people can edit their
--     own metadata, which would let a guest promote themselves.

-- ---------------------------------------------------------------- categories
create table if not exists categories (
  id                      text primary key,
  name                    text not null,
  default_warranty_months int  not null default 12,
  tracking_type           text not null default 'serialized'
                          check (tracking_type in ('serialized', 'bulk'))
);

insert into categories (id, name, default_warranty_months, tracking_type) values
  ('cat-laptop',     'Windows Laptop', 36, 'serialized'),
  ('cat-chromebook', 'Chromebook',     12, 'serialized'),
  ('cat-ipad',       'iPad',           12, 'serialized'),
  ('cat-monitor',    'Monitor',        36, 'serialized'),
  ('cat-printer',    'Printer',        36, 'serialized'),
  ('cat-charger',    'Charger',        12, 'bulk'),
  ('cat-keyboard',   'Keyboard',       12, 'bulk'),
  ('cat-mouse',      'Mouse',          12, 'bulk'),
  ('cat-cable',      'Cable',          12, 'bulk')
on conflict (id) do update
  set name = excluded.name,
      default_warranty_months = excluded.default_warranty_months,
      tracking_type = excluded.tracking_type;

-- ----------------------------------------------------------------- locations
create table if not exists locations (
  id          text primary key,
  name        text not null,
  room_number text,
  floor       text,
  created_at  timestamptz not null default now()
);

create unique index if not exists locations_name_unique
  on locations (lower(name));

-- --------------------------------------------------------------------- staff
create table if not exists staff (
  id         text primary key,
  name       text not null,
  role       text,
  created_at timestamptz not null default now()
);

create unique index if not exists staff_name_unique
  on staff (lower(name));

-- ------------------------------------------------------------------- devices
create table if not exists devices (
  id            uuid primary key default gen_random_uuid(),
  tracking_type text not null default 'serialized'
                check (tracking_type in ('serialized', 'bulk')),
  category_id   text not null references categories(id),
  brand         text not null,
  model         text not null default '',
  asset_tag     text,
  serial        text,
  location_id   text references locations(id) on delete set null,
  assigned_to   text,
  status        text not null default 'In Service'
                check (status in ('In Service', 'Needs Repair', 'Ticket Open',
                                  'Obsolete', 'Disposed')),
  warranty_start date,
  warranty_end   date,
  purchase_date  date,
  vendor         text,
  notes          text,
  photo_url      text,
  created_at     date not null default current_date,
  updated_at     date not null default current_date,
  deleted_at     timestamptz
);

-- One tag per device, case-insensitive, and a removed record keeps its tag.
create unique index if not exists devices_asset_tag_unique
  on devices (upper(asset_tag)) where asset_tag is not null;

create index if not exists devices_deleted_at_idx on devices (deleted_at);
create index if not exists devices_status_idx     on devices (status);
create index if not exists devices_warranty_end_idx on devices (warranty_end);

-- ---------------------------------------------------------------- bulk items
create table if not exists bulk_items (
  id          uuid primary key default gen_random_uuid(),
  category_id text not null references categories(id),
  quantity    int  not null default 0,
  location_id text references locations(id) on delete set null,
  notes       text,
  updated_at  date not null default current_date
);

-- ------------------------------------------------------------ updated_at
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := current_date;
  return new;
end
$$;

drop trigger if exists devices_touch_updated_at on devices;
create trigger devices_touch_updated_at
  before update on devices
  for each row execute function set_updated_at();

-- ------------------------------------------------------------------ profiles
-- One row per login. A missing row means guest, so a newly created account is
-- read-only until someone assigns it a role here.
create table if not exists profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role    text not null default 'guest' check (role in ('admin', 'guest'))
);

-- ------------------------------------------------------------------- access
-- Two kinds of account: admin (adds, edits, removes) and guest (reads only).
-- Anonymous requests get nothing at all.
alter table categories enable row level security;
alter table locations  enable row level security;
alter table staff      enable row level security;
alter table devices    enable row level security;
alter table bulk_items enable row level security;
alter table profiles   enable row level security;

-- security definer so the check can read profiles for the caller; the empty
-- search_path keeps it from resolving anything the caller controls.
create or replace function public.is_admin() returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where user_id = auth.uid() and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- Every table: any signed-in account may read, only an admin may write. The
-- admin policy is `for all` rather than four near-identical policies; the read
-- policy is ORed alongside it, so guests still see every row.

drop policy if exists authenticated_all on categories;
drop policy if exists authenticated_read on categories;
drop policy if exists admin_write on categories;
create policy authenticated_read on categories for select to authenticated using (true);
create policy admin_write on categories for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists authenticated_all on locations;
drop policy if exists authenticated_read on locations;
drop policy if exists admin_write on locations;
create policy authenticated_read on locations for select to authenticated using (true);
create policy admin_write on locations for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists authenticated_all on staff;
drop policy if exists authenticated_read on staff;
drop policy if exists admin_write on staff;
create policy authenticated_read on staff for select to authenticated using (true);
create policy admin_write on staff for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists authenticated_all on devices;
drop policy if exists authenticated_read on devices;
drop policy if exists admin_write on devices;
create policy authenticated_read on devices for select to authenticated using (true);
create policy admin_write on devices for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists authenticated_all on bulk_items;
drop policy if exists authenticated_read on bulk_items;
drop policy if exists admin_write on bulk_items;
create policy authenticated_read on bulk_items for select to authenticated using (true);
create policy admin_write on bulk_items for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- The app reads only its own role, and nothing in the browser may change one:
-- roles are assigned here in the SQL editor. With no write policy, RLS already
-- refuses; the missing grants make that explicit.
drop policy if exists profiles_read_own on profiles;
create policy profiles_read_own on profiles for select to authenticated
  using (user_id = auth.uid());

-- The browser only ever uses the publishable (anon) key, and that key must not
-- reach the tables directly: the app signs in first.
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke insert, update, delete on profiles from authenticated;
