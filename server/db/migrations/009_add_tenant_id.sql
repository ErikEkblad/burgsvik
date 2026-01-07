-- Lägg till tenant_id kolumn för Client Credentials
ALTER TABLE fortnox_token ADD COLUMN IF NOT EXISTS tenant_id text;

-- Gör refresh_token_enc nullable
ALTER TABLE fortnox_token ALTER COLUMN refresh_token_enc DROP NOT NULL;

