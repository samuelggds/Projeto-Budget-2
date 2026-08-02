-- Execute uma vez depois das migrations da mensalidade.
-- Cria as funções ADMIN e BILLING_ADMIN e restringe os dados do sistema.

create table if not exists public.app_user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('ADMIN', 'BILLING_ADMIN')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.app_user_roles enable row level security;

create or replace function public.has_app_role(required_role text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_user_roles
    where user_id = auth.uid() and role = required_role
  );
$$;

revoke all on function public.has_app_role(text) from public;
grant execute on function public.has_app_role(text) to authenticated;

drop policy if exists "User reads own role" on public.app_user_roles;
create policy "User reads own role"
on public.app_user_roles
for select
to authenticated
using (user_id = auth.uid());

-- Remove as políticas antigas que davam acesso total a qualquer conta autenticada.
drop policy if exists "Authenticated manage clients" on public.clients;
drop policy if exists "Authenticated manage services" on public.services;
drop policy if exists "Authenticated manage parts" on public.parts;
drop policy if exists "Authenticated users manage parts" on public.parts;
drop policy if exists "Authenticated manage budgets" on public.budgets;
drop policy if exists "Authenticated manage budget items" on public.budget_items;
drop policy if exists "Authenticated manage app settings" on public.app_settings;
drop policy if exists "Authenticated users manage app settings" on public.app_settings;

create policy "Admin manages clients" on public.clients
for all to authenticated
using (public.has_app_role('ADMIN'))
with check (public.has_app_role('ADMIN'));

create policy "Admin manages services" on public.services
for all to authenticated
using (public.has_app_role('ADMIN'))
with check (public.has_app_role('ADMIN'));

create policy "Admin manages parts" on public.parts
for all to authenticated
using (public.has_app_role('ADMIN'))
with check (public.has_app_role('ADMIN'));

create policy "Admin manages budgets" on public.budgets
for all to authenticated
using (public.has_app_role('ADMIN'))
with check (public.has_app_role('ADMIN'));

create policy "Admin manages budget items" on public.budget_items
for all to authenticated
using (public.has_app_role('ADMIN'))
with check (public.has_app_role('ADMIN'));

create policy "Admin manages app settings" on public.app_settings
for all to authenticated
using (public.has_app_role('ADMIN'))
with check (public.has_app_role('ADMIN'));

-- As duas contas podem consultar a cobrança; nenhuma delas escreve diretamente.
drop policy if exists "Authenticated user reads subscription" on public.app_subscription;
create policy "Authorized user reads subscription"
on public.app_subscription
for select
to authenticated
using (
  public.has_app_role('ADMIN')
  or public.has_app_role('BILLING_ADMIN')
);

drop policy if exists "Authenticated user reads invoices" on public.subscription_invoices;
create policy "Authorized user reads invoices"
on public.subscription_invoices
for select
to authenticated
using (
  public.has_app_role('ADMIN')
  or public.has_app_role('BILLING_ADMIN')
);

