-- Execute depois de complete-database-setup.sql.
-- Adiciona descontos predefinidos nas configurações e suporte a desconto por orçamento.

alter table public.app_settings
  add column if not exists discounts jsonb not null default '[]'::jsonb;

alter table public.budgets
  add column if not exists discount_label text,
  add column if not exists discount_amount numeric(12,2),
  add column if not exists discounts jsonb not null default '[]'::jsonb;
