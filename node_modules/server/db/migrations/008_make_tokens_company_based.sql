-- Migration: Gör tokens företagsbaserade (ändra unique constraint till company_id)
-- Behåll user_id för spårning, men tillåt endast en aktiv token per företag
-- Om flera users har tokens för samma company, behåll den senast uppdaterade

-- Steg 1: Skapa temporär tabell med senaste token per company
create temp table latest_tokens as
select distinct on (company_id)
  id,
  user_id,
  company_id,
  access_token_enc,
  refresh_token_enc,
  scope,
  expires_at,
  updated_at
from fortnox_token
order by company_id, updated_at desc;

-- Steg 2: Ta bort alla tokens
delete from fortnox_token;

-- Steg 3: Ta bort unique constraint på (user_id, company_id)
alter table fortnox_token drop constraint if exists fortnox_token_user_id_company_id_key;

-- Steg 4: Lägg till unique constraint på company_id
alter table fortnox_token add constraint fortnox_token_company_id_key unique (company_id);

-- Steg 5: Återställ data från temporär tabell (behåll user_id för spårning)
insert into fortnox_token (id, user_id, company_id, access_token_enc, refresh_token_enc, scope, expires_at, updated_at)
select 
  id,
  user_id,
  company_id,
  access_token_enc,
  refresh_token_enc,
  scope,
  expires_at,
  updated_at
from latest_tokens;

