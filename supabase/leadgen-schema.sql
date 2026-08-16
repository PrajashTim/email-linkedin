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
