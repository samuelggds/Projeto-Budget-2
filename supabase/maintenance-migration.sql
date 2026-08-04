-- Execute depois de complete-database-setup.sql.
-- Planos de manutenção de equipamentos/veículos.

create table if not exists public.maintenance_plans (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  vehicle_plate text not null,
  brand text not null,
  model text not null,
  first_maintenance_date date not null,
  next_maintenance_date date not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists maintenance_plans_next_date_idx
  on public.maintenance_plans (next_maintenance_date);

alter table public.maintenance_plans enable row level security;

drop policy if exists "Authenticated manage maintenance" on public.maintenance_plans;
create policy "Authenticated manage maintenance"
  on public.maintenance_plans for all to authenticated
  using (true) with check (true);

grant select, insert, update, delete on public.maintenance_plans to authenticated;
