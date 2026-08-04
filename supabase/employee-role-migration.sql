-- Execute uma vez: Supabase > SQL Editor > New query > Run.
-- Adiciona a conta FUNCIONARIO com acesso operacional limitado.

alter table public.app_user_roles
  drop constraint if exists app_user_roles_role_check;
alter table public.app_user_roles
  add constraint app_user_roles_role_check
  check (role in ('ADMIN', 'BILLING_ADMIN', 'FUNCIONARIO'));

alter table public.clients
  add column if not exists created_by uuid references auth.users(id) on delete set null default auth.uid();
alter table public.budgets
  add column if not exists created_by uuid references auth.users(id) on delete set null default auth.uid();

create index if not exists clients_created_by_idx on public.clients(created_by);
create index if not exists budgets_created_by_idx on public.budgets(created_by);

-- Catálogos e identidade da empresa: funcionário apenas consulta.
drop policy if exists "Employee reads services" on public.services;
create policy "Employee reads services" on public.services
for select to authenticated
using (public.has_app_role('FUNCIONARIO'));

drop policy if exists "Employee reads parts" on public.parts;
create policy "Employee reads parts" on public.parts
for select to authenticated
using (public.has_app_role('FUNCIONARIO'));

drop policy if exists "Employee reads app settings" on public.app_settings;
create policy "Employee reads app settings" on public.app_settings
for select to authenticated
using (public.has_app_role('FUNCIONARIO'));

-- Clientes: consulta geral e criação/alteração somente dos registros próprios.
drop policy if exists "Employee reads clients" on public.clients;
create policy "Employee reads clients" on public.clients
for select to authenticated
using (public.has_app_role('FUNCIONARIO'));

drop policy if exists "Employee creates clients" on public.clients;
create policy "Employee creates clients" on public.clients
for insert to authenticated
with check (public.has_app_role('FUNCIONARIO') and created_by = auth.uid());

drop policy if exists "Employee updates own clients" on public.clients;
create policy "Employee updates own clients" on public.clients
for update to authenticated
using (public.has_app_role('FUNCIONARIO') and created_by = auth.uid())
with check (public.has_app_role('FUNCIONARIO') and created_by = auth.uid());

-- O funcionário consulta somente o próprio histórico e só cria/atualiza orçamento próprio
-- enquanto ele ainda estiver no status inicial ENVIADO.
drop policy if exists "Employee reads budgets" on public.budgets;
create policy "Employee reads budgets" on public.budgets
for select to authenticated
using (public.has_app_role('FUNCIONARIO') and created_by = auth.uid());

drop policy if exists "Employee creates budgets" on public.budgets;
create policy "Employee creates budgets" on public.budgets
for insert to authenticated
with check (
  public.has_app_role('FUNCIONARIO')
  and created_by = auth.uid()
  and status = 'ENVIADO'
);

drop policy if exists "Employee updates own sent budgets" on public.budgets;
create policy "Employee updates own sent budgets" on public.budgets
for update to authenticated
using (
  public.has_app_role('FUNCIONARIO')
  and created_by = auth.uid()
  and status = 'ENVIADO'
)
with check (
  public.has_app_role('FUNCIONARIO')
  and created_by = auth.uid()
  and status = 'ENVIADO'
);

drop policy if exists "Employee reads budget items" on public.budget_items;
create policy "Employee reads budget items" on public.budget_items
for select to authenticated
using (
  public.has_app_role('FUNCIONARIO')
  and exists (
    select 1 from public.budgets
    where budgets.id = budget_items.budget_id
      and budgets.created_by = auth.uid()
  )
);

drop policy if exists "Employee creates own budget items" on public.budget_items;
create policy "Employee creates own budget items" on public.budget_items
for insert to authenticated
with check (
  public.has_app_role('FUNCIONARIO')
  and exists (
    select 1 from public.budgets
    where budgets.id = budget_items.budget_id
      and budgets.created_by = auth.uid()
      and budgets.status = 'ENVIADO'
  )
);

drop policy if exists "Employee deletes own budget items" on public.budget_items;
create policy "Employee deletes own budget items" on public.budget_items
for delete to authenticated
using (
  public.has_app_role('FUNCIONARIO')
  and exists (
    select 1 from public.budgets
    where budgets.id = budget_items.budget_id
      and budgets.created_by = auth.uid()
      and budgets.status = 'ENVIADO'
  )
);

-- A autenticação precisa consultar a situação da mensalidade antes de liberar o painel.
drop policy if exists "Authorized user reads subscription" on public.app_subscription;
create policy "Authorized user reads subscription" on public.app_subscription
for select to authenticated
using (
  public.has_app_role('ADMIN')
  or public.has_app_role('BILLING_ADMIN')
  or public.has_app_role('FUNCIONARIO')
);

drop policy if exists "Authorized user reads invoices" on public.subscription_invoices;
create policy "Authorized user reads invoices" on public.subscription_invoices
for select to authenticated
using (
  public.has_app_role('ADMIN')
  or public.has_app_role('BILLING_ADMIN')
  or public.has_app_role('FUNCIONARIO')
);

-- Calcula a numeração global sem expor orçamentos de outras contas ao funcionário.
create or replace function public.get_next_budget_number()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select 'ORC-' || lpad(
    (
      coalesce(
        max((substring(number from '^ORC-([0-9]+)$'))::bigint),
        0
      ) + 1
    )::text,
    2,
    '0'
  )
  from public.budgets;
$$;

revoke all on function public.get_next_budget_number() from public;
grant execute on function public.get_next_budget_number() to authenticated;

-- PDFs persistentes: permitem baixar o histórico em outro celular ou computador.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('budget-pdfs', 'budget-pdfs', false, 10485760, array['application/pdf'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Admin manages budget PDFs" on storage.objects;
create policy "Admin manages budget PDFs" on storage.objects
for all to authenticated
using (bucket_id = 'budget-pdfs' and public.has_app_role('ADMIN'))
with check (bucket_id = 'budget-pdfs' and public.has_app_role('ADMIN'));

drop policy if exists "Employee reads own budget PDFs" on storage.objects;
create policy "Employee reads own budget PDFs" on storage.objects
for select to authenticated
using (
  bucket_id = 'budget-pdfs'
  and public.has_app_role('FUNCIONARIO')
  and exists (
    select 1 from public.budgets
    where budgets.created_by = auth.uid()
      and budgets.pdf_url = storage.objects.name
  )
);

drop policy if exists "Employee creates own budget PDFs" on storage.objects;
create policy "Employee creates own budget PDFs" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'budget-pdfs'
  and public.has_app_role('FUNCIONARIO')
  and (storage.foldername(name))[1] = auth.uid()::text
  and exists (
    select 1 from public.budgets
    where budgets.created_by = auth.uid()
      and budgets.id::text = regexp_replace(storage.filename(name), '\.pdf$', '')
  )
);

drop policy if exists "Employee updates own budget PDFs" on storage.objects;
create policy "Employee updates own budget PDFs" on storage.objects
for update to authenticated
using (
  bucket_id = 'budget-pdfs'
  and public.has_app_role('FUNCIONARIO')
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'budget-pdfs'
  and public.has_app_role('FUNCIONARIO')
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Atualiza o status no histórico sem precisar recarregar a página.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'budgets'
  ) then
    alter publication supabase_realtime add table public.budgets;
  end if;
end $$;
