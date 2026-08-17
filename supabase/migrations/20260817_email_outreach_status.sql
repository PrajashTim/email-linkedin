-- Apply once to the existing LeadGen Supabase project before deploying the
-- dashboard build that reads leadgen_read_page_v2.
alter table public.leadgen_leads
  add column if not exists email_status text not null default '';

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
    channel = excluded.channel, connection_status = excluded.connection_status,
    email_status = excluded.email_status, enrichment_status = excluded.enrichment_status,
    sheet_updated_at = excluded.sheet_updated_at, synced_at = excluded.synced_at;
end;
$$;

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

revoke all on function public.leadgen_read_page_v2(text, integer, integer) from public;
grant execute on function public.leadgen_read_page_v2(text, integer, integer) to anon, authenticated;
