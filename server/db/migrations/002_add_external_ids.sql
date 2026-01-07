-- Add external identifiers and optional metadata for user/company mapping
alter table app_user add column if not exists external_id text unique;
alter table app_user add column if not exists name text;
alter table app_user add column if not exists locale text;

alter table company add column if not exists external_db_number bigint unique;

