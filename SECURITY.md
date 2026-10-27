# Segurança para publicação no portfólio

Esta revisão protege o código público sem publicar segredos ou dados reais de clientes. O banco Supabase de produção **não é alterado por um merge de PR**.

## O que foi revisado

- Variáveis Vite: somente `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` devem estar no frontend. São valores públicos por definição; permissões dependem do RLS. Nunca publicar token do Mercado Pago, `service_role`, chave secreta Supabase, chave privada do updater ou senha.
- Há um `.env` em commits antigos. Revisão inicial apontou valores demonstrativos, mas históricos antigos não são apagados por `.gitignore`; se alguma credencial real já esteve em um commit, **revogá-la e rotacioná-la** no provedor.
- Edge Functions de gestão validam JWT com `auth.getUser()` e papel no banco, apesar de `verify_jwt=false`. Não remover as verificações próprias. O webhook Mercado Pago deve manter `verify_jwt=false` e ser autenticado por assinatura do provedor.
- `supabase/security-hardening-portfolio.sql` restringe RLS administrativo a assinatura ativa, preserva acesso por papéis, limita PDFs privados e adiciona proteção idempotente à RPC de quitação. Não altera o preço nem o limite de 1 dia útil.
- Salvamento local de PDFs: assinatura do arquivo e tamanho validados; escrita atômica sem sobrescrever arquivo preexistente.
- CI: varredura preventiva de nomes de arquivos privados e padrões comuns de segredos, lint, tipagem, testes, auditoria de dependências e build.

## Implantação segura (requer acesso à infraestrutura)

1. Fazer backup do banco Supabase e testar restauração em homologação.
2. Conferir se todas as migrations indicadas no cabeçalho de `security-hardening-portfolio.sql` foram aplicadas no ambiente.
3. Rodar a nova migration primeiro em homologação e validar ADMIN, BILLING_ADMIN, FUNCIONARIO e assinatura ACTIVE/GRACE/BLOCKED/INACTIVE.
4. Confirmar que usuários sem papel não consultam dados; FUNCIONARIO não edita estoque, pagamentos, manutenção ou dados financeiros; ADMIN bloqueado não acessa clientes/serviços/PDFs diretamente pela API; BILLING_ADMIN continua podendo resolver cobranças.
5. Testar repetição e concorrência do webhook e da rotina de manutenção com uma fatura **de teste**: cobrar/confirmar somente uma vez e manter 1 dia útil de tolerância. Não forjar evento de pagamento real.
6. Validar os fluxos completos de orçamento, aprovação/baixa de estoque, cancelamento/restauração, recibos, PDFs, criação e edição de funcionários, fornecedores e planos de manutenção.
7. Verificar a política real de RLS, grants EXECUTE, configurações do Auth, restrição de criação de contas, URLs de redirecionamento, proteção de recovery, MFA para administradores, rate limiting, logs, backup, secrets e permissões do GitHub Actions.
8. Verificar a assinatura HMAC do webhook e habilitar janela de tolerância de timestamp/replay ao confirmar o padrão do Mercado Pago no ambiente.
9. Submeter o PR e revisar resultados de CI e build Tauri (desktop). A configuração `csp: null` do Tauri permanece como **pendência** até testar uma CSP específica que não quebre Supabase, autenticação, imagens e PDFs.
10. Publicar no LinkedIn apenas telas com dados fictícios, CNPJ/CPF/telefone/e-mails fictícios, sem expor QR Pix, identificadores de clientes, tokens ou dados reais de funcionários.

## Pendências e limitações

- Auditoria do banco e dos segredos **em produção**, histórico completo do Git, execução real dos testes e análise dinâmica dependem de acesso à infraestrutura.
- A detecção de segredos do CI é heurística, **não** substitui ferramentas como Gitleaks e secret scanning nativo.
- Relatórios antigos no diretório `coverage/` estão versionados em `main`. O `.gitignore` evita novos arquivos, mas arquivos já rastreados precisam de remoção em mudança separada e com revisão.
- O código do frontend mantém dados locais em `localStorage` e `IndexedDB`; evitar dados reais em screenshots, perfil de demonstração ou exportações.
- Não declarar o sistema "100% seguro". Apresentar tecnologias, controles implementados, cenários testados e limitações.

## Comandos úteis

```bash
npm ci
node scripts/security-check.mjs
npm run lint
npm run type-check
npm run test:coverage
npm audit --audit-level=moderate
npm run build
```
