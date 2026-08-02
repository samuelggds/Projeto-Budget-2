-- Padroniza todos os serviços para a única unidade permitida: un.
-- Execute uma vez: Supabase > SQL Editor > New query > Run.

update public.services
set unit = 'un.', updated_at = now()
where unit is distinct from 'un.';

alter table public.services
  alter column unit set default 'un.';

alter table public.services
  drop constraint if exists services_unit_only_un;

alter table public.services
  add constraint services_unit_only_un check (unit = 'un.');
