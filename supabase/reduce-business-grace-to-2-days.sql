-- TESTE/MIGRATION: reduz a tolerância atual da assinatura principal em 1 dia útil.
-- Execute depois das migrations de billing.
-- Para aumentar 1 dia útil, execute increase-business-grace-to-5-days.sql.

create or replace function public.subtract_business_days(
  initial_date timestamptz,
  number_of_days integer
)
returns timestamptz
language plpgsql
immutable
as $$
declare
  result_date timestamptz := initial_date;
  subtracted_days integer := 0;
begin
  if number_of_days < 0 then
    raise exception 'A quantidade de dias úteis não pode ser negativa';
  end if;

  while subtracted_days < number_of_days loop
    result_date := result_date - interval '1 day';

    if extract(isodow from result_date) between 1 and 5 then
      subtracted_days := subtracted_days + 1;
    end if;
  end loop;

  return result_date;
end;
$$;

begin;

update public.app_subscription
set
  grace_period_ends_at = public.subtract_business_days(grace_period_ends_at, 1),
  updated_at = now()
where id = 'main'
  and billing_enabled = true
  and grace_period_ends_at is not null;

update public.subscription_invoices
set
  grace_period_ends_at = public.subtract_business_days(grace_period_ends_at, 1),
  updated_at = now()
where subscription_id = 'main'
  and status = 'PENDING'
  and grace_period_ends_at is not null;

commit;

-- O maintenance chama esta mesma RPC. Em SQL Editor, a chamada abaixo
-- permite verificar o bloqueio imediatamente quando o prazo já venceu.
select public.block_overdue_subscription();

do $$
declare
  subscription_row public.app_subscription;
begin
  select * into subscription_row
  from public.app_subscription
  where id = 'main';

  if subscription_row.billing_enabled
     and subscription_row.grace_period_ends_at < now()
     and subscription_row.status <> 'BLOCKED' then
    raise exception 'CHECK FALHOU: prazo vencido, mas a assinatura não entrou em BLOCKED';
  end if;
end;
$$;

select
  status,
  current_period_ends_at,
  grace_period_ends_at,
  grace_period_ends_at < now() as prazo_vencido,
  status = 'BLOCKED' as bloqueio_confirmado,
  blocked_at
from public.app_subscription
where id = 'main';
