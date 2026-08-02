-- TESTE CONTROLADO DE PRODUÇÃO — COBRANÇA PIX DE R$ 1,00
-- Execute somente depois de publicar a versão atualizada da Edge Function
-- subscription-maintenance.
--
-- Antes de executar, confira que não existe fatura PENDING.

do $$
begin
  if exists (
    select 1 from public.subscription_invoices where status = 'PENDING'
  ) then
    raise exception 'Existe uma fatura pendente. Cancele ou resolva antes do teste.';
  end if;

  if not exists (
    select 1 from public.app_subscription
    where id = 'main' and billing_enabled = true and status = 'ACTIVE'
  ) then
    raise exception 'Ative a mensalidade antes de preparar o teste.';
  end if;
end;
$$;

update public.app_subscription
set
  monthly_amount = 1.00,
  current_period_ends_at = now() - interval '1 minute',
  grace_period_ends_at = public.add_business_days(now(), 5),
  updated_at = now()
where id = 'main';

select status, monthly_amount, current_period_ends_at, grace_period_ends_at
from public.app_subscription
where id = 'main';

