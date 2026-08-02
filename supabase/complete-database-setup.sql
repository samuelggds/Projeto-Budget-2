-- MG ORÇAMENTOS — BANCO COMPLETO DO ZERO
-- Execute uma única vez em: Supabase > SQL Editor > New query > Run

create table if not exists public.clients (
  id uuid primary key,
  name text not null,
  document text,
  phone text,
  email text,
  contact text,
  address text,
  city text,
  state text,
  cep text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.services (
  id uuid primary key,
  code text not null unique,
  description text not null,
  unit text not null default 'serv.',
  unit_price numeric(12,2) not null default 0 check (unit_price >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.parts (
  id uuid primary key,
  code text not null unique,
  description text not null,
  stock_quantity numeric(12,2) not null default 0 check (stock_quantity >= 0),
  unit_price numeric(12,2) not null default 0 check (unit_price >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.budgets (
  id uuid primary key,
  number text not null unique,
  client_id uuid references public.clients(id) on delete set null,
  issued_at date not null default current_date,
  valid_days integer not null default 5 check (valid_days > 0),
  status text not null default 'ENVIADO' check (status in ('ENVIADO','RECUSADO','EM_ANDAMENTO','APROVADO','PAGO')),
  payment text,
  notes text,
  pdf_url text,
  stock_deducted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.budget_items (
  id uuid primary key,
  budget_id uuid not null references public.budgets(id) on delete cascade,
  service_id uuid references public.services(id) on delete set null,
  part_id uuid references public.parts(id) on delete set null,
  service_code text,
  description text not null,
  quantity numeric(12,2) not null default 1 check (quantity > 0),
  unit text not null default 'un.',
  unit_price numeric(12,2) not null default 0 check (unit_price >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.app_settings (
  id text primary key default 'main' check (id = 'main'),
  company_name text not null default 'MG Refrigeração',
  app_name text not null default 'MG Orçamentos',
  segment text not null default 'Refrigeração',
  document text,
  phone text,
  email text,
  address text,
  logo_data_url text,
  updated_at timestamptz not null default now()
);

create index if not exists budgets_client_id_idx on public.budgets(client_id);
create index if not exists budgets_status_idx on public.budgets(status);
create index if not exists budget_items_budget_id_idx on public.budget_items(budget_id);
create index if not exists budget_items_service_id_idx on public.budget_items(service_id);
create index if not exists budget_items_part_id_idx on public.budget_items(part_id);

alter table public.clients enable row level security;
alter table public.services enable row level security;
alter table public.parts enable row level security;
alter table public.budgets enable row level security;
alter table public.budget_items enable row level security;
alter table public.app_settings enable row level security;

drop policy if exists "Authenticated manage clients" on public.clients;
create policy "Authenticated manage clients" on public.clients for all to authenticated using (true) with check (true);
drop policy if exists "Authenticated manage services" on public.services;
create policy "Authenticated manage services" on public.services for all to authenticated using (true) with check (true);
drop policy if exists "Authenticated manage parts" on public.parts;
create policy "Authenticated manage parts" on public.parts for all to authenticated using (true) with check (true);
drop policy if exists "Authenticated manage budgets" on public.budgets;
create policy "Authenticated manage budgets" on public.budgets for all to authenticated using (true) with check (true);
drop policy if exists "Authenticated manage budget items" on public.budget_items;
create policy "Authenticated manage budget items" on public.budget_items for all to authenticated using (true) with check (true);
drop policy if exists "Authenticated manage app settings" on public.app_settings;
create policy "Authenticated manage app settings" on public.app_settings for all to authenticated using (true) with check (true);

grant select, insert, update, delete on public.clients, public.services, public.parts, public.budgets, public.budget_items, public.app_settings to authenticated;

insert into public.app_settings (id) values ('main') on conflict (id) do nothing;

create or replace function public.validate_budget_status()
returns trigger
language plpgsql
as $$
begin
  if old.status = new.status then return new; end if;
  if old.status = 'ENVIADO' and new.status in ('EM_ANDAMENTO', 'RECUSADO') then return new; end if;
  if old.status = 'EM_ANDAMENTO' and new.status in ('APROVADO', 'RECUSADO') then return new; end if;
  if old.status = 'APROVADO' and new.status = 'PAGO' then return new; end if;
  raise exception 'Mudança de status não permitida: % para %', old.status, new.status;
end;
$$;

drop trigger if exists validate_budget_status_trigger on public.budgets;
create trigger validate_budget_status_trigger
before update of status on public.budgets
for each row execute function public.validate_budget_status();

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
  select status, stock_deducted_at into current_status, deducted_at
  from public.budgets where id = target_budget_id for update;
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
      raise exception 'Estoque insuficiente. Disponível: %, necessário: %', available_quantity, stock_item.required_quantity;
    end if;
    update public.parts set stock_quantity = stock_quantity - stock_item.required_quantity, updated_at = now()
    where id = stock_item.part_id;
  end loop;

  deducted_at := now();
  update public.budgets set status = 'APROVADO', stock_deducted_at = deducted_at, updated_at = deducted_at
  where id = target_budget_id;
  return deducted_at;
end;
$$;

grant execute on function public.approve_budget_and_deduct_stock(uuid) to authenticated;
