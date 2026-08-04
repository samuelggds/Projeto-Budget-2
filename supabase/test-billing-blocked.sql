-- TESTE: Sistema BLOQUEADO com mensalidade de R$ 1,00
-- Execute diretamente OU após test-billing-grace.sql.
-- Se executar diretamente: abra o app e aguarde o QR aparecer (polling de 10s não roda em BLOCKED).
-- Reverta com test-billing-reset.sql.

begin;

-- Remove todas as faturas pendentes para evitar duplicatas
delete from public.subscription_invoices where status = 'PENDING';

-- Coloca a assinatura em estado BLOQUEADO com todos os campos obrigatórios
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

-- Insere fatura PENDENTE — o QR code aparecerá depois de clicar "Atualizar cobrança" na tela de billing admin
-- (A tela de bloqueio não chama a função automaticamente; acesse /mensalidade como BILLING_ADMIN)
insert into public.subscription_invoices (
  subscription_id, external_reference, status, amount,
  period_started_at, period_ends_at, due_at, grace_period_ends_at
) values (
  'main',
  'mg-monthly-' || to_char(now() - interval '10 days', 'YYYYMMDDHHMI24SS'),
  'PENDING',
  1.00,
  now() - interval '40 days',
  now() - interval '10 days',
  now() - interval '10 days',
  now() - interval '3 days'
) on conflict (external_reference) do nothing;

commit;

-- Conferência
select status, monthly_amount, billing_enabled,
       current_period_ends_at, grace_period_ends_at, blocked_at
from public.app_subscription where id = 'main';

select external_reference, status, amount, pix_qr_code is not null as tem_qr
from public.subscription_invoices order by created_at desc limit 3;

