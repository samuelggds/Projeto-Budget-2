-- Persistencia de recibos (historico compartilhado entre navegador e desktop).
-- Executar depois de account-roles-migration.sql,
-- subscription-access-enforcement.sql e employee-subscription-access-enforcement.sql.
-- SQL seguro para repetir: nao apaga recibos existentes.

create schema if not exists private;

create table if not exists public.receipts (
  id uuid primary key default gen_random_uuid(),
  receipt_number bigint not null unique check (receipt_number > 0),
  amount numeric(12, 2) not null default 0 check (amount >= 0),
  received_from text not null default '',
  amount_description text not null default '',
  referring_to text not null default '',
  city text not null default '',
  receipt_date date not null default current_date,
  signer_name text not null default '',
  signer_document text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists receipts_created_at_idx
  on public.receipts (created_at desc);
create index if not exists receipts_created_by_created_at_idx
  on public.receipts (created_by, created_at desc);

-- Atribui numeros no banco sob lock transacional para evitar duplicacao entre
-- dois aparelhos. Permite manter um numero legado quando ainda estiver livre.
-- A autoria, a numeracao e a data de criacao nao podem ser alteradas pela API.
create or replace function private.set_receipt_metadata()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform pg_catalog.pg_advisory_xact_lock(92016, 1);

    if new.receipt_number is null or exists (
      select 1 from public.receipts
      where receipt_number = new.receipt_number
    ) then
      select coalesce(max(receipt_number), 0) + 1
        into new.receipt_number
      from public.receipts;
    end if;

    new.created_by := auth.uid();
    new.updated_at := pg_catalog.now();
  elsif tg_op = 'UPDATE' then
    new.receipt_number := old.receipt_number;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.updated_at := pg_catalog.now();
  end if;
  return new;
end;
$$;

revoke all on function private.set_receipt_metadata() from public, anon, authenticated;

drop trigger if exists receipts_metadata_trigger on public.receipts;
create trigger receipts_metadata_trigger
before insert or update on public.receipts
for each row execute function private.set_receipt_metadata();

alter table public.receipts enable row level security;

-- A conta administrativa acessa todos os recibos da instalacao;
-- funcionarios acessam somente os que emitiram. Ambos exigem mensalidade ativa.
drop policy if exists "Active admin manages receipts" on public.receipts;
create policy "Active admin manages receipts"
on public.receipts for all to authenticated
using (
  public.has_app_role('ADMIN')
  and public.has_active_subscription()
)
with check (
  public.has_app_role('ADMIN')
  and public.has_active_subscription()
);

drop policy if exists "Active employee reads own receipts" on public.receipts;
create policy "Active employee reads own receipts"
on public.receipts for select to authenticated
using (
  public.has_app_role('FUNCIONARIO')
  and public.has_active_subscription()
  and created_by = (select auth.uid())
);

drop policy if exists "Active employee inserts own receipts" on public.receipts;
create policy "Active employee inserts own receipts"
on public.receipts for insert to authenticated
with check (
  public.has_app_role('FUNCIONARIO')
  and public.has_active_subscription()
  and created_by = (select auth.uid())
);

drop policy if exists "Active employee updates own receipts" on public.receipts;
create policy "Active employee updates own receipts"
on public.receipts for update to authenticated
using (
  public.has_app_role('FUNCIONARIO')
  and public.has_active_subscription()
  and created_by = (select auth.uid())
)
with check (
  public.has_app_role('FUNCIONARIO')
  and public.has_active_subscription()
  and created_by = (select auth.uid())
);

drop policy if exists "Active employee deletes own receipts" on public.receipts;
create policy "Active employee deletes own receipts"
on public.receipts for delete to authenticated
using (
  public.has_app_role('FUNCIONARIO')
  and public.has_active_subscription()
  and created_by = (select auth.uid())
);

-- Permissoes minimas: numeracao, autoria e timestamps nao sao editaveis.
revoke all on public.receipts from public, anon, authenticated;
grant select, insert, delete on public.receipts to authenticated;
grant update (
  amount, received_from, amount_description, referring_to,
  city, receipt_date, signer_name, signer_document
) on public.receipts to authenticated;
