-- Restaurant self-registration (2026-11-23).
--
-- Filipino restaurants are invited by email to list themselves for free.
-- They fill in a public form; the row lands here as 'pending' and only an
-- admin's approval copies it into `restaurants`, where the public pages
-- read from. Submissions never touch `restaurants` directly, so a prank or
-- a typo cannot reach the public site.
--
-- Additive only: one new table, one new function, two nullable columns on
-- `restaurants`. Existing rows and code keep working before and after.

-- Contact details shown on the restaurant page once approved.
alter table public.restaurants
  add column if not exists phone text,
  add column if not exists website_url text;

alter table public.restaurants
  add constraint restaurants_phone_length check (phone is null or char_length(phone) <= 30),
  add constraint restaurants_website_url_https check (website_url is null or (website_url ~ '^https://' and char_length(website_url) <= 500));

create table if not exists public.restaurant_applications (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 100),
  prefecture_code text not null check (prefecture_code ~ '^JP-(0[1-9]|[1-3][0-9]|4[0-7])$'),
  city_name text not null check (char_length(city_name) between 1 and 100),
  address text check (address is null or char_length(address) <= 200),
  hours text check (hours is null or char_length(hours) <= 200),
  phone text check (phone is null or char_length(phone) <= 30),
  website_url text check (website_url is null or (website_url ~ '^https://' and char_length(website_url) <= 500)),
  description text check (description is null or char_length(description) <= 1000),
  -- Which language the shop wrote the description in; approval copies it
  -- into the matching description_* column.
  description_lang text not null default 'ja' check (description_lang in ('ja', 'en', 'tl')),
  contact_name text not null check (char_length(contact_name) between 1 and 100),
  contact_email text not null check (char_length(contact_email) between 3 and 254),
  -- Short code carried in the invitation link (?src=...), so a submission
  -- can be traced back to the outreach email that produced it.
  source_code text check (source_code is null or char_length(source_code) <= 64),
  -- sha256 of the client IP with a server-side salt, for the hourly limit.
  -- Never the raw IP.
  ip_hash text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  restaurant_id uuid references public.restaurants(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_restaurant_applications_status_created
  on public.restaurant_applications (status, created_at desc);
create index if not exists idx_restaurant_applications_ip_created
  on public.restaurant_applications (ip_hash, created_at desc);
-- One pending application per shop (same name and phone). A resubmission
-- while the first is still under review is answered "already received".
create unique index if not exists uq_restaurant_applications_pending_shop
  on public.restaurant_applications (lower(name), coalesce(phone, ''))
  where status = 'pending';

-- RLS on with no policies: only the service role (server routes) can read
-- or write. Applicants' contact details are never exposed to other users.
alter table public.restaurant_applications enable row level security;

-- Approve atomically: insert into restaurants and mark the application,
-- or do neither. Only a 'pending' row can be approved, so a double click
-- or a retried request is a no-op that returns null.
create or replace function public.approve_restaurant_application(
  p_application_id uuid,
  p_reviewer uuid
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  app public.restaurant_applications%rowtype;
  new_id uuid;
begin
  select * into app
    from public.restaurant_applications
   where id = p_application_id
     and status = 'pending'
   for update;
  if not found then
    return null;
  end if;

  insert into public.restaurants (
    name, prefecture_code, city_name, address, hours, phone, website_url,
    cuisine_type, description_ja, description_en, description_tl, is_active
  ) values (
    app.name, app.prefecture_code, app.city_name, app.address, app.hours,
    app.phone, app.website_url, 'フィリピン料理',
    case when app.description_lang = 'ja' then app.description end,
    case when app.description_lang = 'en' then app.description end,
    case when app.description_lang = 'tl' then app.description end,
    true
  ) returning id into new_id;

  update public.restaurant_applications
     set status = 'approved',
         restaurant_id = new_id,
         reviewed_by = p_reviewer,
         reviewed_at = now()
   where id = app.id;

  return new_id;
end;
$$;

revoke all on function public.approve_restaurant_application(uuid, uuid) from public, anon, authenticated;
grant execute on function public.approve_restaurant_application(uuid, uuid) to service_role;
