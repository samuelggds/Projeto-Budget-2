-- DESATIVAÇÃO: Desativa a mensalidade e bloqueia o sistema sem apagar dados.
-- Replica o que deactivate-subscription faz no servidor.

begin;

-- Marca todas as faturas pendentes como canceladas (sem deletar)
update public.subscription_invoices
set status = 'CANCELLED', updated_at = now()
where status = 'PENDING' and subscription_id = 'main';

-- Desativa e bloqueia a assinatura
update public.app_subscription
set
  status          = 'BLOCKED',
  billing_enabled = false,
  blocked_at      = coalesce(blocked_at, now()),
  deactivated_at  = now(),
  updated_at      = now()
where id = 'main';

commit;

select status, billing_enabled, blocked_at, deactivated_at
from public.app_subscription where id = 'main';
