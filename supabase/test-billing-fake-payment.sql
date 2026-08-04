-- TESTE: Simula pagamento aprovado sem passar pelo Mercado Pago
-- Fluxo: 1) Execute test-billing-blocked.sql → 2) Abra o app (tela de bloqueio) →
--        3) Execute ESTE script → 4) Observe se o app desbloqueia automaticamente sem F5

begin;

-- Pega a fatura PENDING e marca como PAGA
update public.subscription_invoices
set
  status    = 'PAID',
  paid_at   = now(),
  updated_at = now()
where status = 'PENDING'
  and subscription_id = 'main';

-- Avança o ciclo da assinatura (replica o que mark_subscription_invoice_paid faz)
update public.app_subscription
set
  status                    = 'ACTIVE',
  current_period_started_at = now(),
  current_period_ends_at    = now() + interval '1 month',
  grace_period_ends_at      = now() + interval '1 month' + interval '5 days',
  blocked_at                = null,
  last_payment_at           = now(),
  updated_at                = now()
where id = 'main';

commit;

-- Conferência — o app deve sair da tela de bloqueio automaticamente
select status, current_period_ends_at, grace_period_ends_at, blocked_at
from public.app_subscription
where id = 'main';
