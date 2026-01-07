-- Seed minimal data examples (adjust to your tenant model)
insert into app_user (email)
values ('demo@example.com')
on conflict do nothing;

insert into company (name, org_number)
values ('Demo AB', '559000-0000')
on conflict do nothing;

-- Link demo user to demo company if not already linked
do $$
declare
  u_id uuid;
  c_id uuid;
begin
  select id into u_id from app_user where email = 'demo@example.com' limit 1;
  select id into c_id from company where name = 'Demo AB' limit 1;
  if u_id is not null and c_id is not null then
    insert into user_company (user_id, company_id) values (u_id, c_id)
    on conflict do nothing;
  end if;
end $$;


