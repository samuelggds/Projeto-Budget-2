-- Adiciona campo para imagem de fundo do PDF do orçamento.

alter table public.app_settings
  add column if not exists pdf_background_url text;
