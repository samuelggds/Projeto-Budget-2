-- Execute uma vez: Supabase > SQL Editor > New query > Run.
alter table public.budgets
  add column if not exists technician_name text;
