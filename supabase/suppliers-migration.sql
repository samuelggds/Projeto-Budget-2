-- Execute uma vez no Supabase: SQL Editor > New query > Run.
-- Cadastro administrativo de fornecedores.

create table if not exists public.suppliers (
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

alter table public.suppliers add column if not exists phone text;

create index if not exists suppliers_name_idx on public.suppliers (name);
create index if not exists suppliers_document_idx on public.suppliers (document);

alter table public.suppliers enable row level security;

drop policy if exists "Admin manages suppliers" on public.suppliers;
create policy "Admin manages suppliers"
on public.suppliers
for all
to authenticated
using (public.has_app_role('ADMIN'))
with check (public.has_app_role('ADMIN'));
