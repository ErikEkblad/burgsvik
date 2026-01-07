-- Make app_user.email nullable to support accounts without exposed email
alter table app_user alter column email drop not null;

