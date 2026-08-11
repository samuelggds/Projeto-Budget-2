-- Adiciona coluna de unidade (m, un, kg) à tabela de peças do estoque.
-- Execute uma vez: Supabase > SQL Editor > New query > Run.

alter table public.parts
  add column if not exists unit text not null default 'un';

alter table public.parts
  add constraint parts_unit_valid check (unit in ('m', 'un', 'kg'));
