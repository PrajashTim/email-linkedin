-- Adds lead disposition and a reviewable Day 1 / Day 3 / Day 7 cadence.
-- This migration deliberately does not grant any system permission to send mail.
alter table public.leadgen_leads
  add column if not exists message_day3 text not null default '',
  add column if not exists message_day7 text not null default '',
  add column if not exists workflow_status text not null default 'Active',
  add column if not exists workflow_reason text not null default '',
  add column if not exists email_sequence_status text not null default 'Not started',
  add column if not exists email_next_action_at text not null default '',
  add column if not exists email_paused_step text not null default '';

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
    signal, message, message_day3, message_day7, match_score, match_status, eligibility, channel,
    connection_status, email_status, workflow_status, workflow_reason, email_sequence_status,
    email_next_action_at, email_paused_step, enrichment_status, sheet_updated_at, synced_at
  )
  select
    row_number, company, city, website, person, title, linkedin, email, youtube,
    signal, message, coalesce(message_day3, ''), coalesce(message_day7, ''), match_score, match_status, eligibility, channel,
    connection_status, coalesce(email_status, ''), coalesce(workflow_status, 'Active'), coalesce(workflow_reason, ''), coalesce(email_sequence_status, 'Not started'),
    coalesce(email_next_action_at, ''), coalesce(email_paused_step, ''), enrichment_status, sheet_updated_at, synced_at
  from jsonb_to_recordset(p_leads) as lead(
    row_number integer, company text, city text, website text, person text, title text,
    linkedin text, email text, youtube text, signal text, message text, message_day3 text, message_day7 text, match_score numeric,
    match_status text, eligibility text, channel text, connection_status text, email_status text, workflow_status text, workflow_reason text,
    email_sequence_status text, email_next_action_at text, email_paused_step text,
    enrichment_status text, sheet_updated_at timestamptz, synced_at timestamptz
  )
  on conflict (row_number) do update set
    company = excluded.company, city = excluded.city, website = excluded.website,
    person = excluded.person, title = excluded.title, linkedin = excluded.linkedin,
    email = excluded.email, youtube = excluded.youtube, signal = excluded.signal,
    message = excluded.message, message_day3 = excluded.message_day3, message_day7 = excluded.message_day7, match_score = excluded.match_score,
    match_status = excluded.match_status, eligibility = excluded.eligibility,
    channel = excluded.channel, connection_status = excluded.connection_status, email_status = excluded.email_status,
    workflow_status = excluded.workflow_status, workflow_reason = excluded.workflow_reason,
    email_sequence_status = excluded.email_sequence_status, email_next_action_at = excluded.email_next_action_at, email_paused_step = excluded.email_paused_step,
    enrichment_status = excluded.enrichment_status,
    sheet_updated_at = excluded.sheet_updated_at, synced_at = excluded.synced_at;
end;
$$;

create or replace function public.leadgen_read_page_v3(p_token text, p_limit integer default 80, p_offset integer default 0)
returns table (
  row_number integer, company text, city text, website text, person text, title text,
  linkedin text, email text, youtube text, signal text, message text, message_day3 text, message_day7 text, match_score numeric,
  match_status text, eligibility text, channel text, connection_status text, email_status text, workflow_status text, workflow_reason text,
  email_sequence_status text, email_next_action_at text, email_paused_step text, enrichment_status text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.leadgen_authorized_(p_token) then raise exception 'Unauthorized'; end if;
  return query
  select l.row_number, l.company, l.city, l.website, l.person, l.title, l.linkedin,
    l.email, l.youtube, l.signal, l.message, l.message_day3, l.message_day7, l.match_score, l.match_status,
    l.eligibility, l.channel, l.connection_status, l.email_status, l.workflow_status, l.workflow_reason,
    l.email_sequence_status, l.email_next_action_at, l.email_paused_step, l.enrichment_status
  from public.leadgen_leads l
  order by l.match_score desc, l.row_number asc
  offset greatest(0, p_offset)
  limit least(200, greatest(10, p_limit));
end;
$$;

revoke all on function public.leadgen_read_page_v3(text, integer, integer) from public;
grant execute on function public.leadgen_read_page_v3(text, integer, integer) to anon, authenticated;
