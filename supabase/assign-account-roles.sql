-- Não faça commit deste arquivo depois de inserir e-mails reais.
-- Substitua os dois valores abaixo e execute uma vez no SQL Editor.

insert into public.app_user_roles (user_id, role)
select id, 'ADMIN'
from auth.users
where lower(email) = lower('EMAIL_DA_CONTA_PRINCIPAL_AQUI')
on conflict (user_id) do update
set role = excluded.role, updated_at = now();

insert into public.app_user_roles (user_id, role)
select id, 'BILLING_ADMIN'
from auth.users
where lower(email) = lower('EMAIL_DA_CONTA_DE_ATIVACAO_AQUI')
on conflict (user_id) do update
set role = excluded.role, updated_at = now();

select u.email, r.role
from public.app_user_roles r
join auth.users u on u.id = r.user_id
order by r.role;

