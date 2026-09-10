-- Execute depois das demais migrations da mensalidade.

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

create or replace function public.block_overdue_subscription()
returns public.app_subscription
language plpgsql
security definer
set search_path = public
as $$
declare subscription_row public.app_subscription;
begin
  update public.app_subscription set
    status = 'BLOCKED', blocked_at = coalesce(blocked_at, now()), updated_at = now()
  where id = 'main' and billing_enabled = true
    and grace_period_ends_at < now() and status in ('ACTIVE', 'GRACE')
  returning * into subscription_row;
  if subscription_row.id is null then select * into subscription_row from public.app_subscription where id = 'main'; end if;
  return subscription_row;
end;
$$;

revoke all on function public.mark_subscription_invoice_paid(text,text,text,timestamptz) from public, anon, authenticated;
revoke all on function public.block_overdue_subscription() from public, anon, authenticated;
grant execute on function public.mark_subscription_invoice_paid(text,text,text,timestamptz) to service_role;
grant execute on function public.block_overdue_subscription() to service_role;

