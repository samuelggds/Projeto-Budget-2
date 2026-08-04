-- Execute depois de stock-parts-migration.sql.
-- Adiciona status CANCELADO e funções de cancelar/restaurar orçamento aprovado.

-- Permite CANCELADO na constraint de status
alter table public.budgets
  drop constraint if exists budgets_status_check,
  add constraint budgets_status_check
    check (status in ('ENVIADO','RECUSADO','EM_ANDAMENTO','APROVADO','CANCELADO','PAGO'));

-- Permite APROVADO → CANCELADO e CANCELADO → APROVADO no trigger de validação
create or replace function public.validate_budget_status()
returns trigger
language plpgsql
as $$
begin
  if old.status = new.status then return new; end if;
  if old.status = 'ENVIADO'     and new.status in ('EM_ANDAMENTO', 'RECUSADO') then return new; end if;
  if old.status = 'EM_ANDAMENTO' and new.status in ('APROVADO', 'RECUSADO')    then return new; end if;
  if old.status = 'APROVADO'    and new.status in ('PAGO', 'CANCELADO')        then return new; end if;
  if old.status = 'CANCELADO'   and new.status = 'APROVADO'                    then return new; end if;
  raise exception 'Mudança de status não permitida: % para %', old.status, new.status;
end;
$$;

-- Cancela orçamento aprovado e restaura o estoque das peças
create or replace function public.cancel_approved_budget(target_budget_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_status text;
  deducted_at    timestamptz;
  stock_item     record;
begin
  if not public.has_app_role('ADMIN') then
    raise exception 'Somente o administrador pode cancelar orçamentos';
  end if;

  select status, stock_deducted_at
    into current_status, deducted_at
  from public.budgets
  where id = target_budget_id
  for update;

  if not found then raise exception 'Orçamento não encontrado'; end if;
  if current_status <> 'APROVADO' then
    raise exception 'Somente orçamentos aprovados podem ser cancelados';
  end if;

  -- Devolve as peças ao estoque
  if deducted_at is not null then
    for stock_item in
      select part_id, sum(quantity) as qty
      from public.budget_items
      where budget_id = target_budget_id and part_id is not null
      group by part_id
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

-- Restaura orçamento cancelado voltando para APROVADO e deduzindo o estoque novamente
create or replace function public.restore_cancelled_budget(target_budget_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_status text;
  stock_item     record;
  available      numeric;
begin
  if not public.has_app_role('ADMIN') then
    raise exception 'Somente o administrador pode restaurar orçamentos';
  end if;

  select status
    into current_status
  from public.budgets
  where id = target_budget_id
  for update;

  if not found then raise exception 'Orçamento não encontrado'; end if;
  if current_status <> 'CANCELADO' then
    raise exception 'Somente orçamentos cancelados podem ser restaurados';
  end if;

  -- Verifica e deduz estoque novamente
  for stock_item in
    select part_id, sum(quantity) as qty
    from public.budget_items
    where budget_id = target_budget_id and part_id is not null
    group by part_id
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

revoke all on function public.cancel_approved_budget(uuid)  from public;
revoke all on function public.restore_cancelled_budget(uuid) from public;
grant execute on function public.cancel_approved_budget(uuid)  to authenticated;
grant execute on function public.restore_cancelled_budget(uuid) to authenticated;
