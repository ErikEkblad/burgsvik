-- Migration: Ta bort duplicerade kolumner
-- 1. Ta bort tenant_id från company (använd external_db_number istället)
-- 2. Ta bort auto_reverse_enabled från settings (använd auto_reverse_active istället)

-- Steg 1: Migrera data från tenant_id till external_db_number om external_db_number saknas
update company
set external_db_number = tenant_id
where external_db_number is null and tenant_id is not null;

-- Steg 2: Ta bort tenant_id kolumnen
alter table company drop column if exists tenant_id;

-- Steg 3: Ta bort index för tenant_id om det finns
drop index if exists idx_company_tenant_id;

-- Steg 4: Migrera data från auto_reverse_enabled till auto_reverse_active om auto_reverse_active saknas
update settings
set auto_reverse_active = auto_reverse_enabled
where auto_reverse_active is null and auto_reverse_enabled is not null;

-- Steg 5: Ta bort auto_reverse_enabled kolumnen
alter table settings drop column if exists auto_reverse_enabled;

