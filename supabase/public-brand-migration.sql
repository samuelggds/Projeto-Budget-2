-- Permite que a tela de login leia somente nome, segmento e logo da marca.
-- Dados fiscais e contatos continuam protegidos.

update public.app_settings
set
  company_name = 'Sua empresa',
  app_name = 'Orçamentos',
  segment = 'Gestão de propostas',
  updated_at = now()
where id = 'main'
  and company_name = 'MG Refrigeração'
  and app_name = 'MG Orçamentos';

create or replace function public.get_public_brand()
returns table (
  company_name text,
  app_name text,
  segment text,
  logo_data_url text
)
language sql
stable
security definer
set search_path = public
as $$
  select s.company_name, s.app_name, s.segment, s.logo_data_url
  from public.app_settings s
  where s.id = 'main';
$$;

revoke all on function public.get_public_brand() from public;
grant execute on function public.get_public_brand() to anon, authenticated;

