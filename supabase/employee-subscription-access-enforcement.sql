-- Execute depois de employee-role-migration.sql e subscription-access-enforcement.sql.
-- Garante que o FUNCIONARIO tambem seja bloqueado no banco quando a assinatura expirar.

-- Catalogos e identidade da empresa: funcionario consulta somente com assinatura valida.
drop policy if exists "Employee reads services" on public.services;
create policy "Employee reads services" on public.services
for select to authenticated
using (
  public.has_app_role('FUNCIONARIO')
  and public.has_active_subscription()
);

drop policy if exists "Employee reads parts" on public.parts;
create policy "Employee reads parts" on public.parts
for select to authenticated
using (
  public.has_app_role('FUNCIONARIO')
  and public.has_active_subscription()
);

drop policy if exists "Employee reads app settings" on public.app_settings;
create policy "Employee reads app settings" on public.app_settings
for select to authenticated
using (
  public.has_app_role('FUNCIONARIO')
  and public.has_active_subscription()
);

-- Clientes: leitura e alteracoes proprias somente com assinatura valida.
drop policy if exists "Employee reads clients" on public.clients;
create policy "Employee reads clients" on public.clients
for select to authenticated
using (
  public.has_app_role('FUNCIONARIO')
  and public.has_active_subscription()
);

drop policy if exists "Employee creates clients" on public.clients;
create policy "Employee creates clients" on public.clients
for insert to authenticated
with check (
  public.has_app_role('FUNCIONARIO')
  and public.has_active_subscription()
  and created_by = auth.uid()
);

drop policy if exists "Employee updates own clients" on public.clients;
create policy "Employee updates own clients" on public.clients
for update to authenticated
using (
  public.has_app_role('FUNCIONARIO')
  and public.has_active_subscription()
  and created_by = auth.uid()
)
with check (
  public.has_app_role('FUNCIONARIO')
  and public.has_active_subscription()
  and created_by = auth.uid()
);

-- Orcamentos: somente os proprios e somente enquanto a assinatura estiver valida.
drop policy if exists "Employee reads budgets" on public.budgets;
create policy "Employee reads budgets" on public.budgets
for select to authenticated
using (
  public.has_app_role('FUNCIONARIO')
  and public.has_active_subscription()
  and created_by = auth.uid()
);

drop policy if exists "Employee creates budgets" on public.budgets;
create policy "Employee creates budgets" on public.budgets
for insert to authenticated
with check (
  public.has_app_role('FUNCIONARIO')
  and public.has_active_subscription()
  and created_by = auth.uid()
  and status = 'ENVIADO'
);

drop policy if exists "Employee updates own sent budgets" on public.budgets;
create policy "Employee updates own sent budgets" on public.budgets
for update to authenticated
using (
  public.has_app_role('FUNCIONARIO')
  and public.has_active_subscription()
  and created_by = auth.uid()
  and status = 'ENVIADO'
)
with check (
  public.has_app_role('FUNCIONARIO')
  and public.has_active_subscription()
  and created_by = auth.uid()
  and status = 'ENVIADO'
);

-- Itens de orcamento seguem a mesma regra.
drop policy if exists "Employee reads budget items" on public.budget_items;
create policy "Employee reads budget items" on public.budget_items
for select to authenticated
using (
  public.has_app_role('FUNCIONARIO')
  and public.has_active_subscription()
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
  and public.has_active_subscription()
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
  and public.has_active_subscription()
  and exists (
    select 1 from public.budgets
    where budgets.id = budget_items.budget_id
      and budgets.created_by = auth.uid()
      and budgets.status = 'ENVIADO'
  )
);

-- PDFs persistentes tambem deixam de ser acessiveis quando a assinatura esta bloqueada.
drop policy if exists "Employee reads own budget PDFs" on storage.objects;
create policy "Employee reads own budget PDFs" on storage.objects
for select to authenticated
using (
  bucket_id = 'budget-pdfs'
  and public.has_app_role('FUNCIONARIO')
  and public.has_active_subscription()
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
  and public.has_active_subscription()
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
  and public.has_active_subscription()
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'budget-pdfs'
  and public.has_app_role('FUNCIONARIO')
  and public.has_active_subscription()
  and (storage.foldername(name))[1] = auth.uid()::text
);
