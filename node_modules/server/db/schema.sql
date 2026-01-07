-- Supabase schema for Burgsvik app
-- Tables, indexes, and RLS policies

-- Ensure uuid generation is available
create extension if not exists pgcrypto;

-- 1) Core entities
create table if not exists app_user (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists company (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  org_number text,
  created_at timestamptz not null default now()
);

create table if not exists user_company (
  user_id uuid not null references app_user(id) on delete cascade,
  company_id uuid not null references company(id) on delete cascade,
  primary key (user_id, company_id)
);

-- 2) Fortnox tokens (encrypted values stored by server)
create table if not exists fortnox_token (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references app_user(id) on delete set null,
  company_id uuid not null references company(id) on delete cascade,
  access_token_enc text not null,
  refresh_token_enc text,
  scope text,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now(),
  unique (company_id)
);

-- 3) Settings per user+company
do $$ begin
  if not exists (select 1 from pg_type where typname = 'reverse_mode') then
    create type reverse_mode as enum ('FIRST_DAY_NEXT_MONTH', 'DATE_IN_COMMENT');
  end if;
end $$;

create table if not exists settings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references company(id) on delete cascade,
  auto_reverse_active boolean not null default false,
  auto_reverse_trigger_series text,
  auto_reverse_target_series text,
  auto_reverse_date_mode reverse_mode not null default 'FIRST_DAY_NEXT_MONTH',
  updated_at timestamptz not null default now(),
  unique (company_id)
);

-- 5) WebSocket offsets and idempotency
create table if not exists ws_offset (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references company(id) on delete cascade,
  topic text not null,
  event_offset text not null,
  updated_at timestamptz not null default now(),
  unique (company_id, topic)
);

create table if not exists event_dedupe (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references company(id) on delete cascade,
  topic text not null,
  event_offset text not null,
  received_at timestamptz not null default now(),
  unique (company_id, topic, event_offset)
);

-- 6) Audit log
create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references app_user(id) on delete set null,
  company_id uuid references company(id) on delete set null,
  action text not null,
  payload_json jsonb,
  created_at timestamptz not null default now()
);

-- RLS: enable and restrict per user/company
alter table app_user enable row level security;
alter table company enable row level security;
alter table user_company enable row level security;
alter table fortnox_token enable row level security;
alter table settings enable row level security;
alter table ws_offset enable row level security;
alter table event_dedupe enable row level security;
alter table audit_log enable row level security;

-- Example policies; in production, bind to authenticated user id via JWT custom claims
-- For now, simple policies allowing access will be refined later.
create policy app_user_self on app_user
  for select using (true);

create policy company_all on company
  for select using (true);

create policy user_company_all on user_company
  for select using (true);

create policy fortnox_token_none on fortnox_token
  for select using (false);

create policy settings_select on settings
  for select using (true);

create policy ws_offset_select on ws_offset
  for select using (true);

create policy event_dedupe_select on event_dedupe
  for select using (true);

create policy audit_log_insert on audit_log
  for insert with check (true);


