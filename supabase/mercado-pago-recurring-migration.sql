-- Execute uma vez depois das migrations anteriores da mensalidade.
-- Adiciona recorrência mensal e desativação com bloqueio imediato.

alter table public.app_subscription
  add column if not exists billing_enabled boolean not null default false,
  add column if not exists deactivated_at timestamptz;

create or replace function public.activate_app_subscription()
returns public.app_subscription
language plpgsql
security definer
set search_path = public
as $$
declare
  subscription_row public.app_subscription;
  activation_time timestamptz := now();
  period_end timestamptz;
begin
  select *
  into subscription_row
  from public.app_subscription
  where id = 'main'
  for update;

  if subscription_row.billing_enabled and subscription_row.status in ('ACTIVE', 'GRACE') then
    return subscription_row;
  end if;

  if subscription_row.status = 'BLOCKED' and subscription_row.deactivated_at is null then
    raise exception 'A mensalidade está bloqueada por falta de pagamento';
  end if;

  period_end := activation_time + interval '1 month';

  update public.app_subscription
  set
    status = 'ACTIVE',
    billing_enabled = true,
    activated_at = activation_time,
    current_period_started_at = activation_time,
    current_period_ends_at = period_end,
    grace_period_ends_at = public.add_business_days(period_end, 5),
    blocked_at = null,
    deactivated_at = null,
    updated_at = activation_time
  where id = 'main'
  returning * into subscription_row;

  return subscription_row;
end;
$$;

create or replace function public.deactivate_app_subscription()
returns public.app_subscription
language plpgsql
security definer
set search_path = public
as $$
declare
  subscription_row public.app_subscription;
  deactivation_time timestamptz := now();
begin
  select *
  into subscription_row
  from public.app_subscription
  where id = 'main'
  for update;

  update public.subscription_invoices
  set
    status = 'CANCELLED',
    updated_at = deactivation_time
  where subscription_id = 'main'
    and status = 'PENDING';

  update public.app_subscription
  set
    status = 'INACTIVE',
    billing_enabled = false,
    deactivated_at = deactivation_time,
    blocked_at = deactivation_time,
    updated_at = deactivation_time
  where id = 'main'
  returning * into subscription_row;

  return subscription_row;
end;
$$;

revoke all on function public.activate_app_subscription() from public, anon, authenticated;
revoke all on function public.deactivate_app_subscription() from public, anon, authenticated;
grant execute on function public.activate_app_subscription() to service_role;
grant execute on function public.deactivate_app_subscription() to service_role;
