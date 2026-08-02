-- RESTAURA O VALOR NORMAL DEPOIS QUE O PIX DE TESTE DE R$ 1 FOR GERADO.
-- Execute imediatamente após o QR Code de R$ 1 aparecer, antes ou depois de
-- pagá-lo. A fatura já criada continuará valendo R$ 1 e o próximo ciclo será R$ 250.

update public.app_subscription
set monthly_amount = 250.00, updated_at = now()
where id = 'main';

select status, monthly_amount, current_period_ends_at, grace_period_ends_at
from public.app_subscription
where id = 'main';
