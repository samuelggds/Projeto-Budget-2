-- Execute depois de account-roles-migration.sql e das migrations da mensalidade.
-- Bloqueia também o acesso direto à API quando a assinatura estiver indisponível.

create or replace function public.has_active_subscription()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.app_subscription
    where id = 'main'
      and billing_enabled = true
      and status in ('ACTIVE', 'GRACE')
      and grace_period_ends_at is not null
      and now() <= grace_period_ends_at
  );
$$;

revoke all on function public.has_active_subscription() from public;
grant execute on function public.has_active_subscription() to authenticated;

drop policy if exists "Admin manages clients" on public.clients;
create policy "Active admin manages clients" on public.clients for all to authenticated
using (public.has_app_role('ADMIN') and public.has_active_subscription())
with check (public.has_app_role('ADMIN') and public.has_active_subscription());

drop policy if exists "Admin manages services" on public.services;
create policy "Active admin manages services" on public.services for all to authenticated
using (public.has_app_role('ADMIN') and public.has_active_subscription())
with check (public.has_app_role('ADMIN') and public.has_active_subscription());

drop policy if exists "Admin manages parts" on public.parts;
create policy "Active admin manages parts" on public.parts for all to authenticated
using (public.has_app_role('ADMIN') and public.has_active_subscription())
with check (public.has_app_role('ADMIN') and public.has_active_subscription());

drop policy if exists "Admin manages budgets" on public.budgets;
create policy "Active admin manages budgets" on public.budgets for all to authenticated
using (public.has_app_role('ADMIN') and public.has_active_subscription())
with check (public.has_app_role('ADMIN') and public.has_active_subscription());

drop policy if exists "Admin manages budget items" on public.budget_items;
create policy "Active admin manages budget items" on public.budget_items for all to authenticated
using (public.has_app_role('ADMIN') and public.has_active_subscription())
with check (public.has_app_role('ADMIN') and public.has_active_subscription());

drop policy if exists "Admin manages app settings" on public.app_settings;
create policy "Active admin manages app settings" on public.app_settings for all to authenticated
using (public.has_app_role('ADMIN') and public.has_active_subscription())
with check (public.has_app_role('ADMIN') and public.has_active_subscription());

