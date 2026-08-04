-- Altera o valor da mensalidade.
-- Substitua 250.00 pelo novo valor desejado antes de executar.

update public.app_subscription
set
  monthly_amount = 250.00,
  updated_at     = now()
where id = 'main';

-- Conferência
select id, monthly_amount, status, updated_at
from public.app_subscription
where id = 'main';
