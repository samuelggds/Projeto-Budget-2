-- Execute depois de suppliers-migration.sql e employees-migration.sql.
-- Ciclos mensais, avisos e histórico de pagamentos administrativos.

alter table public.suppliers
  add column if not exists payment_amount numeric(12,2) not null default 0 check (payment_amount >= 0),
  add column if not exists next_payment_date date,
  add column if not exists last_paid_at timestamptz;

alter table public.employees
  add column if not exists payment_amount numeric(12,2) not null default 0 check (payment_amount >= 0),
  add column if not exists next_payment_date date,
  add column if not exists last_paid_at timestamptz;

update public.suppliers
set next_payment_date = (created_at::date + interval '1 month')::date
where next_payment_date is null;

update public.employees
set next_payment_date = (created_at::date + interval '1 month')::date
where next_payment_date is null;

alter table public.suppliers
  alter column next_payment_date set default ((current_date + interval '1 month')::date),
  alter column next_payment_date set not null;

alter table public.employees
  alter column next_payment_date set default ((current_date + interval '1 month')::date),
  alter column next_payment_date set not null;

create table if not exists public.payee_payment_history (
  id uuid primary key default gen_random_uuid(),
  payee_type text not null check (payee_type in ('SUPPLIER', 'EMPLOYEE')),
  payee_id uuid not null,
  payee_name text not null,
  amount numeric(12,2) not null check (amount >= 0),
  due_date date not null,
  paid_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict
);

create index if not exists payee_payment_history_payee_idx
  on public.payee_payment_history (payee_type, payee_id, paid_at desc);

alter table public.payee_payment_history enable row level security;

drop policy if exists "Admin reads payment history" on public.payee_payment_history;
create policy "Admin reads payment history"
on public.payee_payment_history for select to authenticated
using (public.has_app_role('ADMIN'));

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

  next_due := (current_due + interval '1 month')::date;
  while next_due <= current_date loop
    next_due := (next_due + interval '1 month')::date;
  end loop;

  if target_payee_type = 'SUPPLIER' then
    update public.suppliers
    set last_paid_at = now(), next_payment_date = next_due, updated_at = now()
    where id = target_payee_id;
  else
    update public.employees
    set last_paid_at = now(), next_payment_date = next_due, updated_at = now()
    where id = target_payee_id;
  end if;
end;
$$;

revoke all on function public.mark_payee_payment_paid(text, uuid) from public;
grant execute on function public.mark_payee_payment_paid(text, uuid) to authenticated;
