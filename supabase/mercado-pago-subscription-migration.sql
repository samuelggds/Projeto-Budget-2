-- Execute uma vez: Supabase > SQL Editor > New query > Run.
-- Estrutura da mensalidade do MG Orçamentos integrada ao Mercado Pago.

create extension if not exists pgcrypto;

create or replace function public.add_business_days(
  initial_date timestamptz,
  number_of_days integer
)
returns timestamptz
language plpgsql
immutable
as $$
declare
  result_date timestamptz := initial_date;
  added_days integer := 0;
begin
  if number_of_days < 0 then
    raise exception 'A quantidade de dias úteis não pode ser negativa';
  end if;

  while added_days < number_of_days loop
    result_date := result_date + interval '1 day';

    -- ISO: segunda = 1 e domingo = 7.
    if extract(isodow from result_date) between 1 and 5 then
      added_days := added_days + 1;
    end if;
  end loop;

  return result_date;
end;
$$;

create table if not exists public.app_subscription (
  id text primary key default 'main' check (id = 'main'),
  status text not null default 'INACTIVE'
    check (status in ('INACTIVE', 'ACTIVE', 'GRACE', 'BLOCKED')),
  monthly_amount numeric(12,2) not null default 250.00
    check (monthly_amount > 0),
  activated_at timestamptz,
  current_period_started_at timestamptz,
  current_period_ends_at timestamptz,
  grace_period_ends_at timestamptz,
  blocked_at timestamptz,
  last_payment_at timestamptz,
  updated_at timestamptz not null default now(),
  check (
    status = 'INACTIVE'
    or (
      activated_at is not null
      and current_period_started_at is not null
      and current_period_ends_at is not null
      and grace_period_ends_at is not null
    )
  )
);

create table if not exists public.subscription_invoices (
  id uuid primary key default gen_random_uuid(),
  subscription_id text not null default 'main'
    references public.app_subscription(id) on delete cascade,
  external_reference text not null unique,
  status text not null default 'PENDING'
    check (status in ('PENDING', 'PAID', 'EXPIRED', 'CANCELLED')),
  amount numeric(12,2) not null default 250.00 check (amount > 0),
  period_started_at timestamptz not null,
  period_ends_at timestamptz not null,
  due_at timestamptz not null,
  grace_period_ends_at timestamptz not null,
  mercado_pago_order_id text unique,
  mercado_pago_payment_id text,
  pix_qr_code text,
  pix_qr_code_base64 text,
  pix_ticket_url text,
  pix_expires_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subscription_invoices_status_idx
  on public.subscription_invoices(status);

create index if not exists subscription_invoices_due_at_idx
  on public.subscription_invoices(due_at);

alter table public.app_subscription enable row level security;
alter table public.subscription_invoices enable row level security;

drop policy if exists "Authenticated user reads subscription" on public.app_subscription;
create policy "Authenticated user reads subscription"
on public.app_subscription
for select
to authenticated
using (true);

drop policy if exists "Authenticated user reads invoices" on public.subscription_invoices;
create policy "Authenticated user reads invoices"
on public.subscription_invoices
for select
to authenticated
using (true);

-- O frontend pode consultar, mas não pode ativar, quitar ou mudar cobranças.
-- Escritas serão feitas exclusivamente pelas Edge Functions com credencial segura.

insert into public.app_subscription (id)
values ('main')
on conflict (id) do nothing;

