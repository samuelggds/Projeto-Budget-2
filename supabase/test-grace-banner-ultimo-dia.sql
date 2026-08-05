-- TESTE: Último dia — banner deve mostrar "Último dia — o acesso será bloqueado hoje"
-- Execute após test-grace-banner-1dia.sql.

begin;

update public.app_subscription
set
  grace_period_ends_at = now() + interval '10 hours',   -- menos de 1 dia = ceil → 1, mas hoje
  updated_at           = now()
where id = 'main';

update public.subscription_invoices
set
  grace_period_ends_at = now() + interval '10 hours',
  updated_at           = now()
where status = 'PENDING' and subscription_id = 'main';

commit;

select status, grace_period_ends_at,
       ceil(extract(epoch from (grace_period_ends_at - now())) / 86400) as dias_restantes
from public.app_subscription where id = 'main';
