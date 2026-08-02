-- Execute uma vez depois de mercado-pago-subscription-migration.sql.
-- A ativação é atômica e só pode ser chamada pela Edge Function.

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

  if subscription_row.activated_at is not null then
    return subscription_row;
  end if;

  period_end := activation_time + interval '1 month';

  update public.app_subscription
  set
    status = 'ACTIVE',
    activated_at = activation_time,
    current_period_started_at = activation_time,
    current_period_ends_at = period_end,
    grace_period_ends_at = public.add_business_days(period_end, 5),
    blocked_at = null,
    updated_at = activation_time
  where id = 'main'
  returning * into subscription_row;

  return subscription_row;
end;
$$;

revoke all on function public.activate_app_subscription() from public;
revoke all on function public.activate_app_subscription() from anon;
revoke all on function public.activate_app_subscription() from authenticated;
grant execute on function public.activate_app_subscription() to service_role;

