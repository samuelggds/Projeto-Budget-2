-- Migração para instalações já existentes.
-- Fixa a tolerância da mensalidade em 3 dias úteis e alinha o ciclo atual.
-- O prazo do PIX continua independente e é renovado pela Edge Function.

begin;

create or replace function public.activate_app_subscription()
returns public.app_subscription
language plpgsql
security definer
set search_path = public
as $$
declare
  subscription_row public.app_subscription;
  activation_time timestamptz := now();
  period_end timestamptz;
begin
  select * into subscription_row
  from public.app_subscription where id = 'main' for update;

  if subscription_row.billing_enabled and subscription_row.status in ('ACTIVE', 'GRACE') then
    return subscription_row;
  end if;

  if subscription_row.status = 'BLOCKED' and subscription_row.deactivated_at is null then
    raise exception 'A mensalidade está bloqueada por falta de pagamento';
  end if;

  period_end := activation_time + interval '1 month';
  update public.app_subscription set
    status = 'ACTIVE', billing_enabled = true,
    activated_at = activation_time,
    current_period_started_at = activation_time,
    current_period_ends_at = period_end,
    grace_period_ends_at = public.add_business_days(period_end, 3),
    blocked_at = null, deactivated_at = null, updated_at = activation_time
  where id = 'main' returning * into subscription_row;
  return subscription_row;
end;
$$;

create or replace function public.mark_subscription_invoice_paid(
  target_external_reference text,
  target_order_id text,
  target_payment_id text,
  payment_time timestamptz default now()
)
returns public.app_subscription
language plpgsql
security definer
set search_path = public
as $$
declare
  invoice_row public.subscription_invoices;
  subscription_row public.app_subscription;
  next_period_start timestamptz;
  next_period_end timestamptz;
begin
  select * into invoice_row from public.subscription_invoices
  where external_reference = target_external_reference for update;
  if not found then raise exception 'Cobrança não encontrada'; end if;

  if invoice_row.status <> 'PAID' then
    update public.subscription_invoices set
      status = 'PAID', paid_at = payment_time,
      mercado_pago_order_id = coalesce(target_order_id, mercado_pago_order_id),
      mercado_pago_payment_id = coalesce(target_payment_id, mercado_pago_payment_id),
      updated_at = payment_time
    where id = invoice_row.id;
  end if;

  select * into subscription_row from public.app_subscription where id = 'main' for update;
  if not subscription_row.billing_enabled then return subscription_row; end if;

  next_period_start := greatest(invoice_row.period_ends_at, payment_time);
  next_period_end := next_period_start + interval '1 month';
  update public.app_subscription set
    status = 'ACTIVE', current_period_started_at = next_period_start,
    current_period_ends_at = next_period_end,
    grace_period_ends_at = public.add_business_days(next_period_end, 3),
    blocked_at = null, last_payment_at = payment_time, updated_at = payment_time
  where id = 'main' returning * into subscription_row;
  return subscription_row;
end;
$$;

revoke all on function public.activate_app_subscription() from public, anon, authenticated;
grant execute on function public.activate_app_subscription() to service_role;

revoke all on function public.mark_subscription_invoice_paid(text,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.mark_subscription_invoice_paid(text,text,text,timestamptz) to service_role;

-- Alinha o ciclo atual para 3 dias úteis a partir do vencimento.
update public.app_subscription
set
  grace_period_ends_at = public.add_business_days(current_period_ends_at, 3),
  updated_at = now()
where id = 'main'
  and billing_enabled = true
  and current_period_ends_at is not null;

update public.subscription_invoices
set
  grace_period_ends_at = public.add_business_days(due_at, 3),
  updated_at = now()
where subscription_id = 'main'
  and status = 'PENDING'
  and due_at is not null;

commit;

select
  status,
  current_period_ends_at,
  grace_period_ends_at,
  grace_period_ends_at < now() as prazo_vencido,
  blocked_at
from public.app_subscription
where id = 'main';
