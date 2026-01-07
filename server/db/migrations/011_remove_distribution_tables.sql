-- Ta bort distribution-tabeller och relaterade policies/indexes

-- Ta bort RLS policies först
drop policy if exists distribution_key_select on distribution_key;
drop policy if exists distribution_interval_select on distribution_interval;

-- Ta bort indexes
drop index if exists idx_distribution_interval_key;
drop index if exists idx_distribution_key_company;

-- Ta bort tabeller (cascade tar bort beroenden automatiskt)
drop table if exists distribution_interval;
drop table if exists distribution_key;

