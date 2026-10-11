-- Migração incremental: 1 dia útil de tolerância após o vencimento da mensalidade.
-- Aplicar após three-business-day-grace.sql, inclusive em bancos já em produção.
-- Preserva integralmente valores, pagamentos, Pix, webhooks, permissões e bloqueio:
-- somente substitui o argumento do cálculo de tolerância nas duas funções existentes.
-- A execução é transacional e aborta se não encontrar exatamente a regra esperada.

begin;

do $$
declare
  function_signature regprocedure;
  period_variable text;
  function_definition text;
  updated_definition text;
  grace_expression text;
  matches_count integer;
begin
  for function_signature, period_variable in
    select 'public.activate_app_subscription()'::regprocedure, 'period_end'::text
    union all
    select 'public.mark_subscription_invoice_paid(text,text,text,timestamptz)'::regprocedure, 'next_period_end'::text
  loop
    function_definition := pg_get_functiondef(function_signature::oid);

    grace_expression :=
      'public[.]add_business_days[[:space:]]*[(][[:space:]]*'
      || period_variable
      || '[[:space:]]*,[[:space:]]*[0-9]+[[:space:]]*[)]';

    select count(*) into matches_count
    from regexp_matches(function_definition, grace_expression, 'g');

    if matches_count <> 1 then
      raise exception 'Migração abortada: esperado 1 cálculo de tolerância em %, encontrado %',
        function_signature, matches_count;
    end if;

    updated_definition := regexp_replace(
      function_definition,
      grace_expression,
      'public.add_business_days(' || period_variable || ', 1)',
      'g'
    );

    if updated_definition <> function_definition then
      execute updated_definition;
    end if;
  end loop;
end;
$$;

-- Alinha a assinatura atual ao vencimento original, sem acumular reduções.
update public.app_subscription
set
  grace_period_ends_at = public.add_business_days(current_period_ends_at, 1),
  updated_at = now()
where id = 'main'
  and billing_enabled = true
  and current_period_ends_at is not null
  and grace_period_ends_at is distinct from public.add_business_days(current_period_ends_at, 1);

-- Mantém consistente o fim da tolerância das faturas ainda pendentes.
-- O vencimento da fatura, o valor e a validade técnica do Pix não são alterados.
update public.subscription_invoices
set
  grace_period_ends_at = public.add_business_days(due_at, 1),
  updated_at = now()
where subscription_id = 'main'
  and status = 'PENDING'
  and due_at is not null
  and grace_period_ends_at is distinct from public.add_business_days(due_at, 1);

commit;

-- Conferência não destrutiva após a aplicação:
select
  status,
  current_period_ends_at,
  grace_period_ends_at,
  public.add_business_days(current_period_ends_at, 1) as tolerancia_esperada,
  grace_period_ends_at < now() as prazo_vencido,
  blocked_at
from public.app_subscription
where id = 'main';
