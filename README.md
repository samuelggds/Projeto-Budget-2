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

O botão Atualizar cobrança também chama a manutenção manualmente pela conta `BILLING_ADMIN`.

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
- O sistema permanece disponível por mais cinco dias úteis.
- Após a tolerância, o banco nega acesso aos dados e o frontend mostra o bloqueio.
- O webhook confirma o pagamento e inicia o ciclo seguinte.
- Desativar bloqueia imediatamente, cancela cobranças pendentes e interrompe novos ciclos.

Depois de executar `billing-realtime-migration.sql`, as telas recebem alterações
da mensalidade pelo Supabase Realtime. Enquanto existir uma fatura pendente, a
tela também faz uma reconciliação automática a cada 10 segundos como garantia
caso a notificação do Mercado Pago demore.
Ao chegar ao vencimento, as telas de mensalidade chamam automaticamente a rotina
de cobrança e exibem o novo QR Code sem exigir o botão Atualizar cobrança.
