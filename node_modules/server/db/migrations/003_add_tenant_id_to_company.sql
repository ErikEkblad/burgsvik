-- Add tenant_id column to company table for WebSocket tenant mapping
alter table company add column if not exists tenant_id bigint;

-- Create index for faster lookups
create index if not exists idx_company_tenant_id on company(tenant_id) where tenant_id is not null;

