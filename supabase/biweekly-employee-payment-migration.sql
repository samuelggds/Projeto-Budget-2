-- Execute no Supabase: SQL Editor > New query > Run.
-- Altera ciclo de pagamento de funcionários de mensal para quinzenal (15 dias).

-- Atualiza o default de next_payment_date dos funcionários para 15 dias
alter table public.employees
  alter column next_payment_date set default ((current_date + interval '15 days')::date);

-- Recria a função com ciclo quinzenal para EMPLOYEE e mensal para SUPPLIER
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
  if not public.has_app_role('ADMIN') then
    raise exception 'Somente o administrador pode confirmar pagamentos';
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
  values
    (target_payee_type, target_payee_id, current_name, current_amount, current_due);

  -- Fornecedores: ciclo mensal. Funcionários: ciclo quinzenal (15 dias).
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

revoke all on function public.mark_payee_payment_paid(text, uuid) from public;
grant execute on function public.mark_payee_payment_paid(text, uuid) to authenticated;
