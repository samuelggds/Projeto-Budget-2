-- TESTE: Aviso de fatura vencida (GracePeriodBanner)
-- Coloca a assinatura em GRACE com 3 dias restantes e uma fatura PENDING.
-- O banner amarelo deve aparecer no topo em todas as abas imediatamente.
--
-- PASSO 1: Execute este script no SQL Editor do Supabase.
-- PASSO 2: Abra o app — o banner "Fatura vencida · Faltam 3 dias..." deve aparecer.
-- PASSO 3: Troque de abas e confirme que o banner permanece em todas elas.
-- PASSO 4: Execute test-grace-banner-2dias.sql para ver a contagem mudar para 2 dias.
-- PASSO 5: Execute test-billing-fake-payment.sql para simular pagamento e ver o banner sumir.

begin;

delete from public.subscription_invoices where status = 'PENDING';

update public.app_subscription
set
  status                    = 'GRACE',
  monthly_amount            = 1.00,
  billing_enabled           = true,
  activated_at              = now() - interval '2 months',
  current_period_started_at = now() - interval '32 days',
  current_period_ends_at    = now() - interval '2 days',
  grace_period_ends_at      = now() + interval '3 days 4 hours',   -- 3 dias no banner (buffer de 4h evita arredondamento)
  blocked_at                = null,
  deactivated_at            = null,
  last_payment_at           = now() - interval '32 days',
  updated_at                = now()
where id = 'main';

insert into public.subscription_invoices (
  subscription_id, external_reference, status, amount,
  period_started_at, period_ends_at, due_at, grace_period_ends_at
) values (
  'main',
  'mg-monthly-test-grace-banner',
  'PENDING',
  1.00,
  now() - interval '32 days',
  now() - interval '2 days',
  now() - interval '2 days',
  now() + interval '3 days 4 hours'
) on conflict (external_reference) do update set
  status             = 'PENDING',
  grace_period_ends_at = now() + interval '3 days 4 hours',
  updated_at         = now();

commit;

select status, grace_period_ends_at,
       floor(extract(epoch from (grace_period_ends_at - now())) / 86400) as dias_restantes
from public.app_subscription where id = 'main';
