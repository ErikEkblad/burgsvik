-- Ta bort tenant_id kolumn från fortnox_token tabellen
-- external_db_number i company-tabellen används istället via JOIN

ALTER TABLE fortnox_token DROP COLUMN IF EXISTS tenant_id;

