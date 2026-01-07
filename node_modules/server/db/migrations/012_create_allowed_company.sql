-- Skapa tabell för tillåtna företag (whitelist)
create table if not exists allowed_company (
  id uuid primary key default gen_random_uuid(),
  fortnox_database_number bigint not null unique,
  description text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index för snabb lookup på databasnummer
create index if not exists idx_allowed_company_database_number on allowed_company(fortnox_database_number);

-- RLS policy (endast admin ska kunna läsa, men vi använder supabaseAdmin så policies är inte kritiska)
alter table allowed_company enable row level security;

create policy allowed_company_select on allowed_company
  for select using (true);

