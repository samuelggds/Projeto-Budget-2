-- TESTE: Reduz a tolerância para 1 dia — banner deve mostrar "Falta 1 dia"
-- Execute após test-grace-banner.sql para ver a contagem mudar.

begin;

update public.app_subscription
set
  grace_period_ends_at = now() + interval '1 day 4 hours',   -- buffer garante floor = 1
  updated_at           = now()
where id = 'main';

update public.subscription_invoices
set
  grace_period_ends_at = now() + interval '1 day 4 hours',
  updated_at           = now()
where status = 'PENDING' and subscription_id = 'main';

commit;

select status, grace_period_ends_at,
       floor(extract(epoch from (grace_period_ends_at - now())) / 86400) as dias_restantes
from public.app_subscription where id = 'main';
