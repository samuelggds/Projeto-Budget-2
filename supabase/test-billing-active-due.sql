-- TESTE: Ciclo de 1 MÊS vencido — verifica se o QR code aparece
-- Simula assinatura ACTIVE com o período recém-expirado (1 minuto atrás) e
-- dentro da tolerância de 5 dias. O app deve detectar o vencimento pelo
-- polling e chamar subscription-maintenance, gerando o QR automaticamente.
--
-- PASSO 1: Execute este script.
-- PASSO 2: Abra /mensalidade como BILLING_ADMIN e clique "Atualizar cobrança".
-- PASSO 3: O QR de R$ 1,00 deve aparecer.
-- PASSO 4: Para confirmar o pagamento, execute test-billing-fake-payment.sql.
-- Reverta com test-billing-reset.sql.

begin;

-- Remove faturas pendentes para evitar conflitos
delete from public.subscription_invoices where status = 'PENDING';

-- Simula assinatura ACTIVE com período de 1 mês recém-vencido
update public.app_subscription
set
  status                    = 'ACTIVE',
  monthly_amount            = 1.00,
  billing_enabled           = true,
  activated_at              = now() - interval '1 month',
  current_period_started_at = now() - interval '1 month',
  current_period_ends_at    = now() - interval '1 minute',   -- período acabou agora
  grace_period_ends_at      = now() + interval '5 days',     -- 5 dias de tolerância restantes
  blocked_at                = null,
  deactivated_at            = null,
  last_payment_at           = now() - interval '1 month',
  updated_at                = now()
where id = 'main';

-- Insere fatura PENDING para que o QR possa ser gerado pela subscription-maintenance
-- (sem QR code real — o app chamará o Mercado Pago ao clicar "Atualizar cobrança")
insert into public.subscription_invoices (
  subscription_id, external_reference, status, amount,
  period_started_at, period_ends_at, due_at, grace_period_ends_at
) values (
  'main',
  'mg-monthly-' || to_char(now() - interval '1 minute', 'YYYYMMDDHHMI24SS'),
  'PENDING',
  1.00,
  now() - interval '1 month',
  now() - interval '1 minute',
  now() - interval '1 minute',
  now() + interval '5 days'
) on conflict (external_reference) do nothing;

commit;

-- Conferência
select status, monthly_amount, billing_enabled,
       current_period_ends_at, grace_period_ends_at, blocked_at
from public.app_subscription where id = 'main';

select external_reference, status, amount, pix_qr_code is not null as tem_qr
from public.subscription_invoices order by created_at desc limit 3;
