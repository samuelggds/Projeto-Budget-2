-- Execute uma vez: Supabase > SQL Editor > New query > Run.
create table if not exists public.app_settings (
  id text primary key default 'main' check (id = 'main'),
  company_name text not null default 'Sua empresa',
  app_name text not null default 'Orçamentos',
  segment text not null default 'Gestão de propostas',
  document text,
  phone text,
  email text,
  address text,
  logo_data_url text,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

drop policy if exists "Authenticated users manage app settings" on public.app_settings;
create policy "Authenticated users manage app settings"
on public.app_settings
for all
to authenticated
using (true)
with check (true);

insert into public.app_settings (id)
values ('main')
on conflict (id) do nothing;
