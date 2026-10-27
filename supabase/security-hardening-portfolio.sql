-- Hardening incremental para instalações existentes do Budget-2.
-- Aplicar DEPOIS de: employee-subscription-access-enforcement.sql,
-- maintenance-migration.sql, suppliers-migration.sql, employees-migration.sql,
-- payment-reminders-migration.sql, biweekly-employee-payment-migration.sql,
-- cancel-budget-migration.sql e one-business-day-grace.sql.
--
-- Não reinicializa dados, não altera valores de mensalidade nem muda o fluxo Pix.
-- Execute em uma janela de manutenção após backup e teste em homologação.

begin;

-- A política original dava acesso a TODAS as contas autenticadas.
drop policy if exists "Authenticated manage maintenance" on public.maintenance_plans;
drop policy if exists "Active admin manages maintenance" on public.maintenance_plans;
create policy "Active admin manages maintenance"
on public.maintenance_plans for all to authenticated
using (public.has_app_role('ADMIN') and public.has_active_subscription())
with check (public.has_app_role('ADMIN') and public.has_active_subscription());

-- Dados pessoais e chaves Pix de fornecedores/funcionários são administrativos
-- e devem respeitar o bloqueio de mensalidade também na API.
drop policy if exists "Admin manages suppliers" on public.suppliers;
drop policy if exists "Active admin manages suppliers" on public.suppliers;
create policy "Active admin manages suppliers"
on public.suppliers for all to authenticated
using (public.has_app_role('ADMIN') and public.has_active_subscription())
with check (public.has_app_role('ADMIN') and public.has_active_subscription());

drop policy if exists "Admin manages employees" on public.employees;
drop policy if exists "Active admin manages employees" on public.employees;
create policy "Active admin manages employees"
on public.employees for all to authenticated
using (public.has_app_role('ADMIN') and public.has_active_subscription())
with check (public.has_app_role('ADMIN') and public.has_active_subscription());

drop policy if exists "Admin reads payment history" on public.payee_payment_history;
drop policy if exists "Active admin reads payment history" on public.payee_payment_history;
create policy "Active admin reads payment history"
on public.payee_payment_history for select to authenticated
using (public.has_app_role('ADMIN') and public.has_active_subscription());

drop policy if exists "Admin deletes payment history" on public.payee_payment_history;
drop policy if exists "Active admin deletes payment history" on public.payee_payment_history;
create policy "Active admin deletes payment history"
on public.payee_payment_history for delete to authenticated
using (public.has_app_role('ADMIN') and public.has_active_subscription());

-- Bucket privado: a política do ADMIN também precisa respeitar a mensalidade.
-- As políticas já existentes de FUNCIONARIO permanecem intactas.
drop policy if exists "Admin manages budget PDFs" on storage.objects;
drop policy if exists "Active admin manages budget PDFs" on storage.objects;
create policy "Active admin manages budget PDFs"
on storage.objects for all to authenticated
using (
  bucket_id = 'budget-pdfs'
  and public.has_app_role('ADMIN')
  and public.has_active_subscription()
)
with check (
  bucket_id = 'budget-pdfs'
  and public.has_app_role('ADMIN')
  and public.has_active_subscription()
);

-- A RPC de baixa de estoque trabalha sob RLS (SECURITY INVOKER).
-- Validação explícita evita aprovação fora da assinatura e o ORDER BY fixa a
-- ordem de locks das peças para reduzir deadlocks em aprovações concorrentes.
create or replace function public.approve_budget_and_deduct_stock(target_budget_id uuid)
returns timestamptz
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_status text;
  deducted_at timestamptz;
  stock_item record;
  available_quantity numeric;
begin
  if not (public.has_app_role('ADMIN') and public.has_active_subscription()) then
    raise exception 'Acesso não autorizado para aprovar orçamentos';
  end if;

  select status, stock_deducted_at into current_status, deducted_at
  from public.budgets where id = target_budget_id for update;
  if not found then raise exception 'Orçamento não encontrado'; end if;
  if deducted_at is not null then raise exception 'O estoque deste orçamento já foi baixado'; end if;
  if current_status <> 'EM_ANDAMENTO' then
    raise exception 'Somente orçamento em andamento pode ser aprovado';
  end if;

  for stock_item in
    select part_id, sum(quantity) as required_quantity
    from public.budget_items
    where budget_id = target_budget_id and part_id is not null
    group by part_id
    order by part_id
  loop
    select stock_quantity into available_quantity
    from public.parts where id = stock_item.part_id for update;
    if not found then raise exception 'Uma peça do orçamento não existe mais no estoque'; end if;
    if available_quantity < stock_item.required_quantity then
      raise exception 'Estoque insuficiente. Disponível: %, necessário: %',
        available_quantity, stock_item.required_quantity;
    end if;
    update public.parts
    set stock_quantity = stock_quantity - stock_item.required_quantity, updated_at = now()
    where id = stock_item.part_id;
  end loop;

  deducted_at := now();
  update public.budgets
  set status = 'APROVADO', stock_deducted_at = deducted_at, updated_at = deducted_at
  where id = target_budget_id;
  return deducted_at;
end;
$$;

revoke all on function public.approve_budget_and_deduct_stock(uuid) from public, anon;
grant execute on function public.approve_budget_and_deduct_stock(uuid) to authenticated;

-- SECURITY DEFINER ignora RLS do chamador. Por isso cada operação valida
-- explicitamente ADMIN + assinatura ativa antes de qualquer escrita.
create or replace function public.cancel_approved_budget(target_budget_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_status text;
  deducted_at timestamptz;
  stock_item record;
begin
  if not (public.has_app_role('ADMIN') and public.has_active_subscription()) then
    raise exception 'Acesso não autorizado para cancelar orçamentos';
  end if;

  select status, stock_deducted_at into current_status, deducted_at
  from public.budgets where id = target_budget_id for update;
  if not found then raise exception 'Orçamento não encontrado'; end if;
  if current_status <> 'APROVADO' then
    raise exception 'Somente orçamentos aprovados podem ser cancelados';
  end if;

  if deducted_at is not null then
    for stock_item in
      select part_id, sum(quantity) as qty
      from public.budget_items
      where budget_id = target_budget_id and part_id is not null
      group by part_id
      order by part_id
    loop
      update public.parts
      set stock_quantity = stock_quantity + stock_item.qty, updated_at = now()
      where id = stock_item.part_id;
    end loop;
  end if;

  update public.budgets
  set status = 'CANCELADO', stock_deducted_at = null, updated_at = now()
  where id = target_budget_id;
end;
$$;

create or replace function public.restore_cancelled_budget(target_budget_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_status text;
  stock_item record;
  available numeric;
begin
  if not (public.has_app_role('ADMIN') and public.has_active_subscription()) then
    raise exception 'Acesso não autorizado para restaurar orçamentos';
  end if;

  select status into current_status
  from public.budgets where id = target_budget_id for update;
  if not found then raise exception 'Orçamento não encontrado'; end if;
  if current_status <> 'CANCELADO' then
    raise exception 'Somente orçamentos cancelados podem ser restaurados';
  end if;

  for stock_item in
    select part_id, sum(quantity) as qty
    from public.budget_items
    where budget_id = target_budget_id and part_id is not null
    group by part_id
    order by part_id
  loop
    select stock_quantity into available
    from public.parts where id = stock_item.part_id for update;
    if not found then raise exception 'Uma peça do orçamento não existe mais no estoque'; end if;
    if available < stock_item.qty then
      raise exception 'Estoque insuficiente para restaurar o orçamento. Disponível: %, necessário: %',
        available, stock_item.qty;
    end if;
    update public.parts
    set stock_quantity = stock_quantity - stock_item.qty, updated_at = now()
    where id = stock_item.part_id;
  end loop;

  update public.budgets
  set status = 'APROVADO', stock_deducted_at = now(), updated_at = now()
  where id = target_budget_id;
end;
$$;

revoke all on function public.cancel_approved_budget(uuid) from public, anon;
revoke all on function public.restore_cancelled_budget(uuid) from public, anon;
grant execute on function public.cancel_approved_budget(uuid) to authenticated;
grant execute on function public.restore_cancelled_budget(uuid) to authenticated;

-- Mantém o ciclo de pagamentos de funcionários a cada 15 dias e o dos
-- fornecedores mensal, exigindo assinatura ativa antes de registrar o pagamento.
create or replace function public.mark_payee_payment_paid(
  target_payee_type text,
  target_payee_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_name text;
  current_amount numeric(12,2);
  current_due date;
  next_due date;
begin
  if not (public.has_app_role('ADMIN') and public.has_active_subscription()) then
    raise exception 'Acesso não autorizado para confirmar pagamentos';
  end if;

  if target_payee_type = 'SUPPLIER' then
    select name, payment_amount, next_payment_date
    into current_name, current_amount, current_due
    from public.suppliers where id = target_payee_id for update;
  elsif target_payee_type = 'EMPLOYEE' then
    select name, payment_amount, next_payment_date
    into current_name, current_amount, current_due
    from public.employees where id = target_payee_id for update;
  else
    raise exception 'Tipo de pagamento inválido';
  end if;

  if current_name is null then raise exception 'Cadastro não encontrado'; end if;

  insert into public.payee_payment_history
    (payee_type, payee_id, payee_name, amount, due_date)
  values (target_payee_type, target_payee_id, current_name, current_amount, current_due);

  if target_payee_type = 'SUPPLIER' then
    next_due := (current_due + interval '1 month')::date;
    while next_due <= current_date loop
      next_due := (next_due + interval '1 month')::date;
    end loop;
    update public.suppliers
    set last_paid_at = now(), next_payment_date = next_due, updated_at = now()
    where id = target_payee_id;
  else
    next_due := (current_due + interval '15 days')::date;
    while next_due <= current_date loop
      next_due := (next_due + interval '15 days')::date;
    end loop;
    update public.employees
    set last_paid_at = now(), next_payment_date = next_due, updated_at = now()
    where id = target_payee_id;
  end if;
end;
$$;

revoke all on function public.mark_payee_payment_paid(text, uuid) from public, anon;
grant execute on function public.mark_payee_payment_paid(text, uuid) to authenticated;

-- Cada fatura paga só pode alterar o ciclo UMA vez. Webhooks repetidos ou
-- reconciliações concorrentes não podem mover novamente a data de vencimento.
-- Mantém a regra de 1 dia útil da última migration de mensalidade.
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

  -- O lock da fatura garante idempotência mesmo em duas chamadas simultâneas.
  if invoice_row.status = 'PAID' then
    select * into subscription_row from public.app_subscription
    where id = 'main';
    return subscription_row;
  end if;

  update public.subscription_invoices set
    status = 'PAID', paid_at = payment_time,
    mercado_pago_order_id = coalesce(target_order_id, mercado_pago_order_id),
    mercado_pago_payment_id = coalesce(target_payment_id, mercado_pago_payment_id),
    updated_at = payment_time
  where id = invoice_row.id;

  select * into subscription_row from public.app_subscription
  where id = 'main' for update;
  if not subscription_row.billing_enabled then return subscription_row; end if;

  -- Um pagamento atrasado de uma fatura antiga não pode regredir o ciclo atual.
  if subscription_row.current_period_started_at > invoice_row.period_ends_at then
    return subscription_row;
  end if;

  next_period_start := greatest(invoice_row.period_ends_at, payment_time);
  next_period_end := next_period_start + interval '1 month';
  update public.app_subscription set
    status = 'ACTIVE', current_period_started_at = next_period_start,
    current_period_ends_at = next_period_end,
    grace_period_ends_at = public.add_business_days(next_period_end, 1),
    blocked_at = null, last_payment_at = payment_time, updated_at = payment_time
  where id = 'main' returning * into subscription_row;
  return subscription_row;
end;
$$;

revoke all on function public.mark_subscription_invoice_paid(text,text,text,timestamptz)
from public, anon, authenticated;
grant execute on function public.mark_subscription_invoice_paid(text,text,text,timestamptz)
to service_role;

commit;
