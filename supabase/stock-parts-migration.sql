-- Execute uma vez: Supabase > SQL Editor > New query > Run.
create table if not exists public.parts (
  id uuid primary key,
  code text not null unique,
  description text not null,
  stock_quantity numeric(12,2) not null default 0 check (stock_quantity >= 0),
  unit_price numeric(12,2) not null default 0 check (unit_price >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.parts enable row level security;
drop policy if exists "Authenticated users manage parts" on public.parts;
create policy "Authenticated users manage parts"
on public.parts for all to authenticated using (true) with check (true);

alter table public.budget_items
  add column if not exists part_id uuid references public.parts(id) on delete set null;

alter table public.budgets
  add column if not exists stock_deducted_at timestamptz;

create index if not exists budget_items_part_id_idx on public.budget_items(part_id);

create or replace function public.approve_budget_and_deduct_stock(target_budget_id uuid)
returns timestamptz
language plpgsql
as $$
declare
  current_status text;
  deducted_at timestamptz;
  stock_item record;
  available_quantity numeric;
begin
  select status, stock_deducted_at
    into current_status, deducted_at
  from public.budgets
  where id = target_budget_id
  for update;

  if not found then raise exception 'Orçamento não encontrado'; end if;
  if deducted_at is not null then raise exception 'O estoque deste orçamento já foi baixado'; end if;
  if current_status <> 'EM_ANDAMENTO' then raise exception 'Somente orçamento em andamento pode ser aprovado'; end if;

  for stock_item in
    select part_id, sum(quantity) as required_quantity
    from public.budget_items
    where budget_id = target_budget_id and part_id is not null
    group by part_id
  loop
    select stock_quantity into available_quantity
    from public.parts where id = stock_item.part_id for update;

    if not found then raise exception 'Uma peça do orçamento não existe mais no estoque'; end if;
    if available_quantity < stock_item.required_quantity then
      raise exception 'Estoque insuficiente para uma das peças. Disponível: %, necessário: %', available_quantity, stock_item.required_quantity;
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

grant execute on function public.approve_budget_and_deduct_stock(uuid) to authenticated;
