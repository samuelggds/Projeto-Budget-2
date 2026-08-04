-- TESTE: Sistema em VENCIMENTO com tolerância ativa e mensalidade de R$ 1,00
-- Simula assinatura vencida mas dentro do período de graça (tolerância de 5 dias úteis).
-- PASSO 1: Execute este script.
-- PASSO 2: Abra o app e clique em "Atualizar cobrança" para gerar o QR code de R$ 1,00.
-- PASSO 3: Para testar BLOQUEADO, execute test-billing-grace-to-blocked.sql depois que o QR aparecer.
-- Reverta com test-billing-reset.sql.

begin;

-- Remove TODAS as faturas pendentes para evitar duplicatas
delete from public.subscription_invoices where status = 'PENDING';

-- Coloca a assinatura em estado GRACE com R$ 1,00
-- A função subscription-maintenance criará a fatura com external_reference correto
update public.app_subscription
set
  status                    = 'GRACE',
  monthly_amount            = 1.00,
  billing_enabled           = true,
  activated_at              = now() - interval '2 months',
  current_period_started_at = now() - interval '32 days',
  current_period_ends_at    = now() - interval '2 days',
  grace_period_ends_at      = now() + interval '3 days',
  blocked_at                = null,
  deactivated_at            = null,
  last_payment_at           = now() - interval '32 days',
  updated_at                = now()
where id = 'main';

commit;

-- Conferência
select status, monthly_amount, billing_enabled,
       current_period_ends_at, grace_period_ends_at
from public.app_subscription
where id = 'main';

