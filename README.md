# Orçamentos

Aplicação React + TypeScript com Supabase, marca personalizável, orçamentos, clientes, serviços, estoque, PDF e mensalidade recorrente de R$ 250 via Pix Mercado Pago.

## Executar o frontend

```bash
npm install
npm run dev
```

Copie `.env.example` para `.env` e preencha somente a URL e a chave pública do Supabase. Nunca coloque Access Token do Mercado Pago em variável `VITE_`.

## Contas

- `ADMIN`: usa o sistema enquanto a mensalidade estiver válida.
- `BILLING_ADMIN`: acessa somente o painel de mensalidade, ativação, desativação, Pix e histórico.
- `FUNCIONARIO`: cria, salva e baixa orçamentos; consulta clientes, serviços e estoque sem cadastrar, editar ou excluir.

Não existe cadastro público. Crie os usuários em Authentication > Users e desative novos cadastros no provedor de e-mail.

## Ordem das migrations

Execute uma vez no SQL Editor:

1. `complete-database-setup.sql`
2. `app-settings-migration.sql`
3. `stock-parts-migration.sql`
4. `mercado-pago-subscription-migration.sql`
5. `mercado-pago-activation-migration.sql`
6. `account-roles-migration.sql`
7. `assign-account-roles.sql` (troque os placeholders somente no SQL Editor)
8. `mercado-pago-recurring-migration.sql`
9. `subscription-reactivation-reset.sql`
10. `billing-automation-migration.sql`
11. `subscription-access-enforcement.sql`
12. `public-brand-migration.sql`
13. `billing-realtime-migration.sql`
14. `service-unit-migration.sql`
15. `employee-role-migration.sql`
16. `technician-responsible-migration.sql`
17. `three-business-day-grace.sql`

A migration `three-business-day-grace.sql` também deve ser executada em instalações que já estavam em produção antes desta alteração. Ela atualiza as funções do banco para usar 3 dias úteis nos próximos ciclos e alinha o ciclo pendente atual.

Para cadastrar um funcionário, crie a conta em **Authentication > Users**, abra
`assign-account-roles.sql`, substitua `EMAIL_DA_CONTA_DO_FUNCIONARIO_AQUI` pelo
e-mail criado e execute o bloco `FUNCIONARIO` no SQL Editor.

## Secrets das Edge Functions

Cadastre em Supabase > Edge Functions > Secrets:

```text
MERCADO_PAGO_ACCESS_TOKEN_TEST=Access Token de teste
MERCADO_PAGO_PAYER_EMAIL=e-mail do pagador
MERCADO_PAGO_ENVIRONMENT=test
CRON_SECRET=texto longo e aleatório
MERCADO_PAGO_WEBHOOK_SECRET=preencher depois de configurar o webhook
```

Em produção, adicione `MERCADO_PAGO_ACCESS_TOKEN` e troque `MERCADO_PAGO_ENVIRONMENT` para `production`.

## Publicar funções

```bash
npx supabase login
npx supabase link --project-ref SEU_PROJECT_REF
npx supabase functions deploy activate-subscription
npx supabase functions deploy deactivate-subscription
npx supabase functions deploy subscription-maintenance
npx supabase functions deploy mercado-pago-webhook
```

Sempre que `supabase/functions/subscription-maintenance/index.ts` for alterado, publique novamente `subscription-maintenance`. É essa Edge Function que consulta o Mercado Pago e renova cobranças Pix expiradas ou incompletas.

## Webhook Mercado Pago

Na aplicação Mercado Pago, abra Webhooks e cadastre:

```text
https://SEU_PROJECT_REF.supabase.co/functions/v1/mercado-pago-webhook
```

Selecione o evento `Order (Mercado Pago)`, salve e copie a assinatura secreta gerada para o Secret `MERCADO_PAGO_WEBHOOK_SECRET`.

## Agendamento diário

Em Supabase > Integrations > Cron, crie um Job diário para chamar a Edge Function `subscription-maintenance`. Inclua o header:

```text
x-cron-secret: o mesmo valor salvo em CRON_SECRET
```

Agendamento sugerido: `0 12 * * *` (todos os dias às 12:00 UTC, 09:00 no horário de Fortaleza).

O painel também chama a manutenção periodicamente enquanto existir cobrança pendente. Se o QR Code estiver expirado ou não tiver sido retornado corretamente, a tela tenta renovar automaticamente e também exibe o botão **Gerar novo QR Code** para uma tentativa manual.

## Preparar para entregar a um novo cliente

Depois de testar o sistema, execute `supabase/reset-for-new-client.sql` uma única
vez no SQL Editor. O script limpa os dados operacionais e a identidade da empresa,
mas preserva os usuários do Auth e suas funções de acesso.

Depois do reset, entre como `ADMIN`, abra **Configurações** e preencha logo, nome
da empresa, nome do sistema, segmento, CNPJ/CPF, telefone, e-mail e endereço.
Esses dados serão usados na interface e nos PDFs. A conta `BILLING_ADMIN` deve
reativar a mensalidade quando a instalação estiver pronta para uso.

## Regra da mensalidade

- Ativar inicia um ciclo de um mês.
- No vencimento, a rotina cria a cobrança Pix de R$ 250.
- O sistema permanece disponível por mais **3 dias úteis** de tolerância.
- Após os 3 dias úteis, o banco nega acesso aos dados e o frontend mostra o bloqueio.
- O bloqueio não encerra a possibilidade de pagamento: a cobrança Pix continua disponível.
- O QR Code Pix tem validade técnica própria e, quando expira ou fica incompleto, é renovado automaticamente pela rotina de manutenção.
- Se a renovação automática não aparecer na tela, o cliente pode usar **Gerar novo QR Code**.
- Renovar o Pix nunca aumenta a tolerância nem desbloqueia o sistema sem pagamento.
- O webhook confirma o pagamento e inicia o ciclo seguinte, novamente com 3 dias úteis de tolerância após o próximo vencimento.
- Desativar bloqueia imediatamente, cancela cobranças pendentes e interrompe novos ciclos.

Depois de executar `billing-realtime-migration.sql`, as telas recebem alterações
da mensalidade pelo Supabase Realtime. Enquanto existir uma fatura pendente, a
tela também faz uma reconciliação automática periódica como garantia caso a
notificação do Mercado Pago demore.
Ao chegar ao vencimento, as telas de mensalidade chamam automaticamente a rotina
de cobrança e exibem o novo QR Code sem exigir ação manual.
