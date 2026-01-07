-- Utöka settings med fält för automatisk vändning
alter table if exists settings
  add column if not exists auto_reverse_active boolean default false,
  add column if not exists auto_reverse_trigger_series text,
  add column if not exists auto_reverse_target_series text,
  add column if not exists auto_reverse_date_mode reverse_mode default 'FIRST_DAY_NEXT_MONTH';


