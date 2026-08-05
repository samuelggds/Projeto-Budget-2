-- Execute no Supabase: SQL Editor > New query > Run.
-- Permite que o admin exclua registros do histórico de pagamentos.

drop policy if exists "Admin deletes payment history" on public.payee_payment_history;
create policy "Admin deletes payment history"
on public.payee_payment_history for delete to authenticated
using (public.has_app_role('ADMIN'));
