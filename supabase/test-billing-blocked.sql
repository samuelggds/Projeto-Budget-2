-- TESTE: Sistema BLOQUEADO com mensalidade de R$ 1,00
-- Simula assinatura vencida + período de graça expirado → sistema bloqueado.
-- Execute no Supabase SQL Editor. Reverta com test-billing-reset.sql.

begin;

-- Remove faturas de teste anteriores para evitar conflito no unique
delete from public.subscription_invoices
where external_reference like 'TEST-%';

-- Coloca a assinatura em estado BLOQUEADO com R$ 1,00
update public.app_subscription
set
  status                    = 'BLOCKED',
  monthly_amount            = 1.00,
  billing_enabled           = true,
  activated_at              = now() - interval '3 months',
  current_period_started_at = now() - interval '40 days',
  current_period_ends_at    = now() - interval '10 days',
  grace_period_ends_at      = now() - interval '3 days',
  blocked_at                = now() - interval '3 days',
  deactivated_at            = null,
  last_payment_at           = now() - interval '40 days',
  updated_at                = now()
where id = 'main';

-- Cria fatura PENDENTE de R$ 1,00 (o app gera o QR code ao abrir a tela de pagamento)
insert into public.subscription_invoices (
  subscription_id,
  external_reference,
  status,
  amount,
  period_started_at,
  period_ends_at,
  due_at,
  grace_period_ends_at,
  created_at,
  updated_at
) values (
  'main',
  'TEST-BLOCKED-' || to_char(now(), 'YYYYMMDD-HH24MISS'),
  'PENDING',
  1.00,
  now() - interval '40 days',
  now() - interval '10 days',
  now() - interval '10 days',
  now() - interval '3 days',
  now(),
  now()
);

commit;

-- Conferência
select status, monthly_amount, billing_enabled,
       current_period_ends_at, grace_period_ends_at, blocked_at
from public.app_subscription
where id = 'main';

select id, status, amount, due_at, external_reference
from public.subscription_invoices
order by created_at desc
limit 3;
