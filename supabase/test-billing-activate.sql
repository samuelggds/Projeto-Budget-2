-- ATIVAÇÃO: Restaura a assinatura para ACTIVE sem apagar dados existentes.
-- Use depois de qualquer teste para voltar ao estado normal de produção.

begin;

-- Marca todas as faturas pendentes como canceladas (sem deletar)
update public.subscription_invoices
set status = 'CANCELLED', updated_at = now()
where status = 'PENDING' and subscription_id = 'main';

-- Restaura assinatura para ACTIVE com ciclo normal de 1 mês
update public.app_subscription
set
  status                    = 'ACTIVE',
  billing_enabled           = true,
  current_period_started_at = now(),
  current_period_ends_at    = now() + interval '1 month',
  grace_period_ends_at      = now() + interval '1 month' + interval '5 days',
  blocked_at                = null,
  deactivated_at            = null,
  last_payment_at           = now(),
  updated_at                = now()
where id = 'main';

commit;

select status, billing_enabled, current_period_ends_at, grace_period_ends_at, blocked_at
from public.app_subscription where id = 'main';
