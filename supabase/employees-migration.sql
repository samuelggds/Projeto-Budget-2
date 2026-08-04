-- Execute uma vez no Supabase: SQL Editor > New query > Run.
-- Cadastro administrativo de funcionários. Não cria contas de acesso.

create table if not exists public.employees (
  id uuid primary key,
  name text not null check (length(trim(name)) > 0),
  document text,
  phone text,
  payment_method text,
  pix_key text,
  payment_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.employees add column if not exists phone text;

create index if not exists employees_name_idx on public.employees (name);
create index if not exists employees_document_idx on public.employees (document);

alter table public.employees enable row level security;

drop policy if exists "Admin manages employees" on public.employees;
create policy "Admin manages employees"
on public.employees
for all
to authenticated
using (public.has_app_role('ADMIN'))
with check (public.has_app_role('ADMIN'));
