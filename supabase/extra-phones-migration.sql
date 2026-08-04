-- Execute depois de complete-database-setup.sql.
-- Adiciona campos de telefones adicionais para contato.

alter table public.app_settings
  add column if not exists phone2 text,
  add column if not exists phone3 text,
  add column if not exists phone4 text;
