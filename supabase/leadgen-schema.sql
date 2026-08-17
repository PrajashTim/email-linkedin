-- Sheet3 remains the editing source of truth. Supabase is the private,
-- read-optimized mirror used by the LeadGen dashboard.
create table if not exists public.leadgen_leads (
  row_number integer primary key,
  company text not null,
  city text not null default '',
  website text not null default '',
  person text not null default '',
  title text not null default '',
  linkedin text not null default '',
  email text not null default '',
  youtube text not null default '',
  signal text not null default '',
  message text not null default '',
  match_score numeric not null default 0,
  match_status text not null default '',
  eligibility text not null default '',
  channel text not null default '',
  connection_status text not null default '',
  email_status text not null default '',
  enrichment_status text not null default '',
  sheet_updated_at timestamptz not null default now(),
  synced_at timestamptz not null default now()
);

create index if not exists leadgen_leads_priority_idx
  on public.leadgen_leads (match_score desc, row_number asc);
create index if not exists leadgen_leads_company_idx
  on public.leadgen_leads (company);

create table if not exists public.leadgen_meta (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.leadgen_leads enable row level security;
alter table public.leadgen_meta enable row level security;

-- Intentionally no public policies: only the server-side Vercel route and
-- Apps Script service credential access this mirror.

-- The hosted project's service-key reveal is unavailable, so the two trusted
-- backends use narrowly scoped RPCs protected by this private token. Replace
-- the placeholder only while executing this migration; never commit a value.
create table if not exists public.leadgen_private_config (
  singleton boolean primary key default true check (singleton),
  sync_token text not null
);
alter table public.leadgen_private_config enable row level security;
insert into public.leadgen_private_config (singleton, sync_token)
values (true, '__LEADGEN_SYNC_TOKEN__')
on conflict (singleton) do update set sync_token = excluded.sync_token;

create or replace function public.leadgen_authorized_(p_token text)
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.leadgen_private_config where singleton and sync_token = p_token
  );
$$;

create or replace function public.leadgen_upsert(p_token text, p_leads jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.leadgen_authorized_(p_token) then raise exception 'Unauthorized'; end if;
  insert into public.leadgen_leads (
    row_number, company, city, website, person, title, linkedin, email, youtube,
    signal, message, match_score, match_status, eligibility, channel,
    connection_status, email_status, enrichment_status, sheet_updated_at, synced_at
  )
  select
    row_number, company, city, website, person, title, linkedin, email, youtube,
    signal, message, match_score, match_status, eligibility, channel,
    connection_status, coalesce(email_status, ''), enrichment_status, sheet_updated_at, synced_at
  from jsonb_to_recordset(p_leads) as lead(
    row_number integer, company text, city text, website text, person text, title text,
    linkedin text, email text, youtube text, signal text, message text, match_score numeric,
    match_status text, eligibility text, channel text, connection_status text, email_status text,
    enrichment_status text, sheet_updated_at timestamptz, synced_at timestamptz
  )
  on conflict (row_number) do update set
    company = excluded.company, city = excluded.city, website = excluded.website,
    person = excluded.person, title = excluded.title, linkedin = excluded.linkedin,
    email = excluded.email, youtube = excluded.youtube, signal = excluded.signal,
    message = excluded.message, match_score = excluded.match_score,
    match_status = excluded.match_status, eligibility = excluded.eligibility,
    channel = excluded.channel, connection_status = excluded.connection_status, email_status = excluded.email_status,
    enrichment_status = excluded.enrichment_status,
    sheet_updated_at = excluded.sheet_updated_at, synced_at = excluded.synced_at;
end;
$$;

create or replace function public.leadgen_set_meta(p_token text, p_value jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.leadgen_authorized_(p_token) then raise exception 'Unauthorized'; end if;
  insert into public.leadgen_meta (key, value, updated_at)
  values ('dashboard', p_value, now())
  on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at;
end;
$$;

create or replace function public.leadgen_read_page(p_token text, p_limit integer default 80, p_offset integer default 0)
returns table (
  row_number integer, company text, city text, website text, person text, title text,
  linkedin text, email text, youtube text, signal text, message text, match_score numeric,
  match_status text, eligibility text, channel text, connection_status text, enrichment_status text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.leadgen_authorized_(p_token) then raise exception 'Unauthorized'; end if;
  return query
  select l.row_number, l.company, l.city, l.website, l.person, l.title, l.linkedin,
    l.email, l.youtube, l.signal, l.message, l.match_score, l.match_status,
    l.eligibility, l.channel, l.connection_status, l.enrichment_status
  from public.leadgen_leads l
  order by l.match_score desc, l.row_number asc
  offset greatest(0, p_offset)
  limit least(200, greatest(10, p_limit));
end;
$$;

-- v2 adds independent email-outreach state without changing the original
-- function's return type. Existing dashboard deployments can keep using v1.
create or replace function public.leadgen_read_page_v2(p_token text, p_limit integer default 80, p_offset integer default 0)
returns table (
  row_number integer, company text, city text, website text, person text, title text,
  linkedin text, email text, youtube text, signal text, message text, match_score numeric,
  match_status text, eligibility text, channel text, connection_status text, email_status text, enrichment_status text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.leadgen_authorized_(p_token) then raise exception 'Unauthorized'; end if;
  return query
  select l.row_number, l.company, l.city, l.website, l.person, l.title, l.linkedin,
    l.email, l.youtube, l.signal, l.message, l.match_score, l.match_status,
    l.eligibility, l.channel, l.connection_status, l.email_status, l.enrichment_status
  from public.leadgen_leads l
  order by l.match_score desc, l.row_number asc
  offset greatest(0, p_offset)
  limit least(200, greatest(10, p_limit));
end;
$$;

create or replace function public.leadgen_read_meta(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare result jsonb;
begin
  if not public.leadgen_authorized_(p_token) then raise exception 'Unauthorized'; end if;
  select value into result from public.leadgen_meta where key = 'dashboard';
  return result;
end;
$$;

create or replace function public.leadgen_count(p_token text)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.leadgen_authorized_(p_token) then raise exception 'Unauthorized'; end if;
  return (select count(*)::integer from public.leadgen_leads);
end;
$$;

revoke all on function public.leadgen_authorized_(text) from public;
revoke all on function public.leadgen_upsert(text, jsonb) from public;
revoke all on function public.leadgen_set_meta(text, jsonb) from public;
revoke all on function public.leadgen_read_page(text, integer, integer) from public;
revoke all on function public.leadgen_read_page_v2(text, integer, integer) from public;
revoke all on function public.leadgen_read_meta(text) from public;
revoke all on function public.leadgen_count(text) from public;
grant execute on function public.leadgen_upsert(text, jsonb) to anon, authenticated;
grant execute on function public.leadgen_set_meta(text, jsonb) to anon, authenticated;
grant execute on function public.leadgen_read_page(text, integer, integer) to anon, authenticated;
grant execute on function public.leadgen_read_page_v2(text, integer, integer) to anon, authenticated;
grant execute on function public.leadgen_read_meta(text) to anon, authenticated;
grant execute on function public.leadgen_count(text) to anon, authenticated;
