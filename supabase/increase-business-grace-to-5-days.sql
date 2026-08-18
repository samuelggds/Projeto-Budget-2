-- TESTE/MIGRATION: aumenta a tolerância atual da assinatura principal em 1 dia útil.

create or replace function public.add_business_days(
  initial_date timestamptz,
  number_of_days integer
)
returns timestamptz
language plpgsql
immutable
as $$
declare
  result_date timestamptz := initial_date;
  added_days integer := 0;
begin
  if number_of_days < 0 then
    raise exception 'A quantidade de dias úteis não pode ser negativa';
  end if;

  while added_days < number_of_days loop
    result_date := result_date + interval '1 day';

    if extract(isodow from result_date) between 1 and 5 then
      added_days := added_days + 1;
    end if;
  end loop;

  return result_date;
end;
$$;

begin;

update public.app_subscription
set
  grace_period_ends_at = public.add_business_days(grace_period_ends_at, 1),
  updated_at = now()
where id = 'main'
  and billing_enabled = true
  and grace_period_ends_at is not null;

update public.subscription_invoices
set
  grace_period_ends_at = public.add_business_days(grace_period_ends_at, 1),
  updated_at = now()
where subscription_id = 'main'
  and status = 'PENDING'
  and grace_period_ends_at is not null;

commit;

select
  status,
  current_period_ends_at,
  grace_period_ends_at,
  grace_period_ends_at < now() as prazo_vencido,
  blocked_at
from public.app_subscription
where id = 'main';
