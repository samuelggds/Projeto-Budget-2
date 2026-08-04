-- TESTE: Sistema em VENCIMENTO com tolerância ativa e mensalidade de R$ 1,00
-- Simula assinatura vencida mas dentro do período de graça (tolerância de 5 dias úteis).
-- Execute no Supabase SQL Editor. Reverta com test-billing-reset.sql.

begin;

-- Remove faturas de teste anteriores para evitar conflito no unique
delete from public.subscription_invoices
where external_reference like 'TEST-%';

-- Coloca a assinatura em estado GRACE (vencida, dentro da tolerância) com R$ 1,00
update public.app_subscription
set
  status                    = 'GRACE',
  monthly_amount            = 1.00,
  billing_enabled           = true,
  activated_at              = now() - interval '2 months',
  current_period_started_at = now() - interval '32 days',
  current_period_ends_at    = now() - interval '2 days',
  grace_period_ends_at      = now() + interval '3 days',  -- tolerância ainda válida
  blocked_at                = null,
  deactivated_at            = null,
  last_payment_at           = now() - interval '32 days',
  updated_at                = now()
where id = 'main';

-- Cria fatura PENDENTE de R$ 1,00
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
  'TEST-GRACE-' || to_char(now(), 'YYYYMMDD-HH24MISS'),
  'PENDING',
  1.00,
  now() - interval '32 days',
  now() - interval '2 days',
  now() - interval '2 days',
  now() + interval '3 days',
  now(),
  now()
);

commit;

-- Conferência
select status, monthly_amount, billing_enabled,
       current_period_ends_at, grace_period_ends_at, blocked_at
from public.app_subscription
where id = 'main';

select id, status, amount, due_at, grace_period_ends_at, external_reference
from public.subscription_invoices
order by created_at desc
limit 3;
