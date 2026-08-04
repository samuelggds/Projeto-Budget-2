-- RESET PARA ENTREGA A UM NOVO CLIENTE
--
-- Execute somente quando quiser entregar uma instalação limpa:
-- Supabase > SQL Editor > New query > cole este arquivo > Run.
--
-- PRESERVA: usuários de auth.users, funções ADMIN/BILLING_ADMIN, estrutura do
-- banco, políticas, Edge Functions, secrets, webhook e cron.
-- APAGA: orçamentos, clientes, serviços, peças, fornecedores, funcionários,
--        histórico de pagamentos, planos de manutenção, faturas e dados da marca.
-- Faça um backup antes. A exclusão não pode ser desfeita.

begin;

-- Ordem respeita chaves estrangeiras.
delete from public.budget_items;
delete from public.budgets;
delete from public.clients;
delete from public.services;
delete from public.parts;
delete from public.payee_payment_history;
delete from public.suppliers;
delete from public.employees;
delete from public.maintenance_plans;
delete from public.subscription_invoices;

-- Identidade neutra para o novo cliente preencher pela aba Configurações.
insert into public.app_settings (
  id, company_name, app_name, segment,
  document, phone, phone2, phone3, phone4,
  email, address, logo_data_url, pdf_background_url,
  discounts, updated_at
)
values (
  'main', 'Sua empresa', 'Orçamentos', 'Gestão de propostas',
  null, null, null, null, null,
  null, null, null, null,
  '[]'::jsonb, now()
)
on conflict (id) do update set
  company_name       = excluded.company_name,
  app_name           = excluded.app_name,
  segment            = excluded.segment,
  document           = excluded.document,
  phone              = excluded.phone,
  phone2             = excluded.phone2,
  phone3             = excluded.phone3,
  phone4             = excluded.phone4,
  email              = excluded.email,
  address            = excluded.address,
  logo_data_url      = excluded.logo_data_url,
  pdf_background_url = excluded.pdf_background_url,
  discounts          = excluded.discounts,
  updated_at         = excluded.updated_at;

-- O BILLING_ADMIN ativa a mensalidade depois que a entrega estiver pronta.
update public.app_subscription
set
  status                      = 'INACTIVE',
  monthly_amount              = 250.00,
  billing_enabled             = false,
  activated_at                = null,
  current_period_started_at   = null,
  current_period_ends_at      = null,
  grace_period_ends_at        = null,
  blocked_at                  = null,
  deactivated_at              = null,
  last_payment_at             = null,
  updated_at                  = now()
where id = 'main';

commit;

-- Conferência final.
select id, company_name, app_name, segment,
       document, phone, phone2, phone3, phone4,
       email, address,
       (logo_data_url      is not null) as possui_logo,
       (pdf_background_url is not null) as possui_fundo_pdf,
       jsonb_array_length(discounts)    as qtd_descontos
from public.app_settings
where id = 'main';

select status, monthly_amount, billing_enabled
from public.app_subscription
where id = 'main';

select role, count(*) as quantidade
from public.app_user_roles
group by role
order by role;

select
  (select count(*) from public.budgets)           as orcamentos,
  (select count(*) from public.clients)           as clientes,
  (select count(*) from public.services)          as servicos,
  (select count(*) from public.parts)             as pecas,
  (select count(*) from public.suppliers)         as fornecedores,
  (select count(*) from public.employees)         as funcionarios,
  (select count(*) from public.maintenance_plans) as planos_manutencao;
