-- Migration: Gör settings företagsbaserade (ta bort user_id)
-- Om flera users har settings för samma company, behåll den senast uppdaterade

-- Steg 1: Skapa temporär tabell med senaste settings per company
create temp table latest_settings as
select distinct on (company_id)
  id,
  company_id,
  auto_reverse_active,
  auto_reverse_trigger_series,
  auto_reverse_target_series,
  auto_reverse_date_mode,
  updated_at
from settings
order by company_id, updated_at desc;

-- Steg 2: Ta bort alla settings
delete from settings;

-- Steg 3: Ta bort unique constraint på (user_id, company_id)
alter table settings drop constraint if exists settings_user_id_company_id_key;

-- Steg 4: Ta bort user_id kolumnen
alter table settings drop column if exists user_id;

-- Steg 5: Lägg till unique constraint på company_id
alter table settings add constraint settings_company_id_key unique (company_id);

-- Steg 6: Återställ data från temporär tabell
insert into settings (id, company_id, auto_reverse_active, auto_reverse_trigger_series, auto_reverse_target_series, auto_reverse_date_mode, updated_at)
select 
  id,
  company_id,
  auto_reverse_active,
  auto_reverse_trigger_series,
  auto_reverse_target_series,
  auto_reverse_date_mode,
  updated_at
from latest_settings;

-- Steg 7: Ta bort foreign key constraint på user_id om den finns
alter table settings drop constraint if exists settings_user_id_fkey;

