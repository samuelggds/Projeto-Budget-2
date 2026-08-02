-- Habilita atualização em tempo real da mensalidade e das faturas.
-- Execute uma vez: Supabase > SQL Editor > New query > Run.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'app_subscription'
  ) then
    alter publication supabase_realtime add table public.app_subscription;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'subscription_invoices'
  ) then
    alter publication supabase_realtime add table public.subscription_invoices;
  end if;
end;
$$;
