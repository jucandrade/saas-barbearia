# Implementation Plan: Barbearia, usuários e autenticação

**Branch**: `002-tenant-auth` | **Date**: 2026-10-21 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/002-tenant-auth/spec.md`

## Summary

Primeira feature com banco de dados: cria a base multi-tenant (barbearia → unidade → usuário), a autenticação por e-mail e senha com sessão opaca revogável, o primeiro acesso por convite, a recuperação de senha, a gestão de equipe pelo dono e a trilha de auditoria. O isolamento entre barbearias é garantido por **Row Level Security** no PostgreSQL, com a API conectada por um papel sem permissão de contornar a RLS e o contexto do tenant definido por transação. Antes do login, três funções `SECURITY DEFINER` mínimas encontram usuário, sessão e token. As regras puras (política de senha, duração da sessão, bloqueio de login, validade de tokens, último dono) vão para `packages/domain` em TDD. Provisionamento de barbearias e anonimização de dados são comandos da equipe do produto, sem rota HTTP. Acesso a dados com **Drizzle ORM** e migrations com `drizzle-kit` ([ADR 0002](../../docs/adr/0002-orm-e-migrations.md)); e-mail por SMTP com Mailpit em desenvolvimento. Detalhes e alternativas em [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript (`strict`) sobre Node.js 24 LTS, como na 001.

**Primary Dependencies** (novas; versões exatas travadas no `pnpm-lock.yaml`): `drizzle-orm` 0.45 + `pg` 8 + `drizzle-kit` 0.31 (dev); `argon2` 0.45; `nodemailer` 10; `@nestjs/throttler` 6; `zod` 4 (em `packages/contracts`, e usado pela API). Mobile: `expo-secure-store`. Já existentes: NestJS 12, Next.js 16, Expo SDK 58, Vitest 5. Nenhuma biblioteca de CLI, de contexto assíncrono ou de OpenAPI ([R7](research.md#r7-envio-de-e-mail), [R9](research.md#r9-provisionamento-e-anonimização-pela-equipe-do-produto), [R10](research.md#r10-contratos), [R11](research.md#r11-autorização-e-contexto-do-tenant-na-api)).

**Storage**: PostgreSQL 17 com RLS (o do Docker Compose da 001), com dois papéis: dono do esquema e `app_runtime` ([R2](research.md#r2-isolamento-por-rls-e-papéis-do-banco)). Redis não é usado por esta feature. Mailpit novo no Compose, só para desenvolvimento e testes manuais.

**Testing**: Vitest. Unitários em `packages/domain` e `packages/contracts` (sem banco, Linux e Windows). Integração em `apps/api` (`pnpm test:integration`) contra o Postgres do Compose, com migrations reais e suíte de vazamento entre tenants ([R14](research.md#r14-testes)). Nenhum teste de interface além de verificação de tipos e lint nos apps de tela.

**Target Platform**: Desenvolvimento em Windows 11 (PowerShell) e Linux; CI em `ubuntu-latest` e `windows-latest`. Integração roda só no Linux.

**Project Type**: Monorepo existente; esta feature toca `apps/api`, `apps/admin`, `apps/barber`, `packages/domain` e `packages/contracts`.

**Performance Goals**: Login e acesso em menos de 30 segundos do ponto de vista do usuário (SC-002); revogação de sessão efetiva na requisição seguinte (SC-004 permite 1 minuto); hash de senha em torno de 50 a 150 ms por tentativa.

**Constraints**: RLS com falha fechada: sem contexto de tenant nenhuma linha é lida nem escrita (FR-017); respostas de login, convite e recuperação indistinguíveis quanto à existência do e-mail, em conteúdo e em tempo (FR-014); nenhum dado pessoal ou IP em logs ou eventos (FR-020, FR-021); `pnpm test` da raiz sem exigir banco (continuidade da 001); comandos iguais em PowerShell e bash.

**Scale/Scope**: 6 tabelas, 3 funções de banco, 12 endpoints, 3 comandos da equipe do produto, 5 telas no admin e 1 no app do barbeiro, 11 tipos de evento de segurança. Dezenas de barbearias e centenas de usuários no horizonte da fase.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio / Restrição | Status | Observação |
|---|---|---|
| I. Multi-tenancy | ✅ | Hierarquia barbearia → unidade desde a primeira migration; `tenant_id` e RLS com `FORCE` em todas as tabelas; API sem `BYPASSRLS`, contexto por transação, falha fechada; suíte automatizada de vazamento entre tenants ([R2](research.md#r2-isolamento-por-rls-e-papéis-do-banco), [R14](research.md#r14-testes)). O isolamento atende, na feature, a "toda assinatura nasce vinculada à unidade" apenas por estrutura: não há assinatura aqui. Exceção documentada em Complexity Tracking: `security_events.tenant_id` nulo. |
| II. Integridade financeira | N/A | Sem valores monetários nem ledger. A trilha de auditoria é imutável por permissão e gatilho, seguindo o espírito do princípio. |
| III. Regras parametrizáveis | N/A | As regras de senha, sessão e bloqueio são de segurança, não de remuneração; ficam como constantes nomeadas no domínio, ajustáveis por configuração de ambiente quando necessário. |
| IV. Domínio puro e test-first | ✅ | Regras em funções puras em `packages/domain`, sem relógio (hora como parâmetro), com testes escritos antes ([R12](research.md#r12-regras-puras-em-packagesdomain)). Sem golden test: não há cálculo financeiro. |
| V. Contratos primeiro | ✅ | Schemas Zod em `packages/contracts` antes da implementação; mesmos schemas validam a API e tipam os clientes; OpenAPI 3.1 gerado a partir deles ([R10](research.md#r10-contratos), [contracts/api.md](contracts/api.md)). Testes de contrato por endpoint. |
| VI. Monólito modular | ✅ | Um único módulo `IdentityModule` (bounded context "Identidade e Tenancy"); nenhum acesso a tabelas de outros contextos. |
| VII. Confiabilidade de integrações e jobs | ✅ (com nota) | Sem webhooks nem jobs. O envio de e-mail depende de uma transação; adotado **envio após o commit com reenvio idempotente** como equivalente ao outbox para esta única mensagem de baixo risco. Registrado em Complexity Tracking. Toda operação de gestão e de acesso grava evento com autor e horário. |
| VIII. Mobile-first e simplicidade | ✅ | Telas organizadas por tarefa (Entrar, Equipe); login do barbeiro no celular com sessão de 30 dias para não atrapalhar o balcão. |
| IX. Privacidade e LGPD | ✅ | Só nome e e-mail do usuário; senha com Argon2id; sem IP, e-mail ou nome em logs e eventos; anonimização irreversível por comando da equipe do produto (FR-024); nenhum dado de pagamento. |
| X. Simplicidade e entrega por fases | ✅ | Sem Redis, fila, biblioteca de CLI, de OpenAPI ou de contexto assíncrono; sem gestão de unidades, papéis extras ou login social; telas no mínimo. |
| Restrições técnicas (TS strict, NestJS, PostgreSQL com RLS, Next.js, Expo, datas em UTC com fuso por unidade) | ✅ | Seguidas: `timestamptz`, fuso IANA na unidade. |
| Decisão aberta "ORM e migrations" | ✅ | Resolvida pelo [ADR 0002](../../docs/adr/0002-orm-e-migrations.md) (status Aceito). |
| Decisão aberta "Gateway de pagamento" | N/A | Não usada. |
| Decisões abertas "Hospedagem, CD, observabilidade" | N/A | Continuam abertas; o provedor de e-mail de produção depende delas e fica para essa feature (o código usa SMTP genérico). |
| Fluxo: PR com testes, lint e type-check | ✅ | A CI ganha as etapas `Migrate` e `Integration test` no job `linux` ([contracts/commands.md](contracts/commands.md)). |

**Resultado (pré-pesquisa)**: aprovado; a única decisão aberta exigida (ORM) foi resolvida por ADR.
**Resultado (pós-design)**: aprovado, com duas notas justificadas em Complexity Tracking.

**Reavaliação com os arquivos reais (T090, após a implementação)**: aprovado, sem violações novas.

| Princípio | Verificado nos arquivos |
|---|---|
| I | Seis tabelas com `ENABLE` e `FORCE ROW LEVEL SECURITY` (`apps/api/drizzle/0001_rls-and-permissions.sql`). A API usa `app_runtime`, que não é superusuário, não tem `BYPASSRLS` e não é dona de tabela (`rls.spec.ts`). Suítes `rls.spec.ts` e `leak.spec.ts` cobrem leitura e escrita cruzadas por tabela e por endpoint; a remoção silenciosa de uma política (`USING (true)`) quebra o `rls.spec.ts`. |
| IV | `packages/domain` não declara nenhuma dependência e a regra de lint proíbe frameworks, banco, rede e relógio; as regras recebem a hora por parâmetro. Na API, nenhum serviço lê `Date.now()` fora de `Clock`. |
| V | Schemas Zod em `packages/contracts`, registro de rotas e OpenAPI 3.1 gerado dele; `routes.spec.ts` garante que toda rota dos controladores está no registro com o mesmo acesso, e os testes de contrato cobrem cada endpoint. |
| VI | Um `IdentityModule`; o `CliModule` só reaproveita os mesmos serviços com a conexão administrativa. |
| VII | E-mail após o commit, com reenvio; o envio da recuperação não é aguardado. Falhas de envio são registradas sem dado pessoal (`logs.spec.ts`). |
| IX | `logs.spec.ts` e `full-audit.spec.ts` provam que logs e eventos não trazem e-mail, nome, senha, token nem IP; a anonimização apaga nome e e-mail (SC-008). |
| X | Nenhum uso de Redis, fila ou biblioteca de CLI. |

**O que a implementação ensinou** (já corrigido e coberto por teste):

1. As políticas `TO app_auth` valem também para quem **herda** o papel; o papel que migra recebe `app_auth` com `INHERIT FALSE`, senão herdaria leitura sem contexto de tenant e furaria a RLS.
2. O `REVOKE ... FROM PUBLIC` das funções `auth_*` precisa vir **antes** de passar a posse a `app_auth`; depois, quem migra deixa de ser dono e o comando não tem efeito. O acesso de quem migra é concedido depois da troca de dono.
3. O `lint` precisa depender do build dos pacotes (`turbo.json`), porque um checkout limpo não tem o `dist` de `@barbearia/contracts`.


## Project Structure

### Documentation (this feature)

```text
specs/002-tenant-auth/
├── plan.md              # Este arquivo
├── research.md          # Fase 0: decisões e alternativas (R1 a R16)
├── data-model.md        # Fase 1: tabelas, RLS, transições, funções de banco
├── quickstart.md        # Fase 1: roteiro de validação ponta a ponta
├── contracts/
│   ├── api.md           # Contrato dos endpoints de identity
│   └── commands.md      # Comandos novos, comandos da equipe do produto, mudança na CI
├── checklists/
│   └── requirements.md  # Qualidade da spec
└── tasks.md             # Fase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
.
├── docs/adr/0002-orm-e-migrations.md
├── docker-compose.yml                       # + mailpit (SMTP 1025, UI 8025)
├── .env.example                             # + variáveis de R16
├── .github/workflows/ci.yml                 # + etapas Migrate e Integration test (linux)
├── apps/
│   ├── api/
│   │   ├── drizzle.config.ts
│   │   ├── drizzle/                         # migrations SQL versionadas (inclui RLS, funções, gatilhos)
│   │   ├── src/
│   │   │   ├── config/env.ts                # leitura e validação (Zod) das variáveis
│   │   │   ├── db/
│   │   │   │   ├── schema/                  # barbershop, unit, user, access-token, session, security-event
│   │   │   │   ├── tenant-db.ts             # transação com app.tenant_id (falha fechada)
│   │   │   │   └── migrate.ts               # garante app_runtime e aplica migrations
│   │   │   ├── identity/                  # IdentityModule
│   │   │   │   ├── auth/                    # login, logout, eu, guard, sessão
│   │   │   │   ├── invitations/                # accept, validate
│   │   │   │   ├── recovery/             # forgot, reset
│   │   │   │   ├── team/                  # list, invite, resend, deactivate, reactivate
│   │   │   │   ├── auditoria/               # registro de eventos de segurança
│   │   │   │   └── email/                   # EmailPort, adaptador SMTP, adaptador em memória
│   │   │   ├── cli/                         # provision-barbershop, resend-owner-invitation, anonymize-user
│   │   │   └── app.module.ts                # + IdentityModule
│   │   └── test/
│   │       ├── integration/contract/        # um test por endpoint (exigem database)
│   │       └── integration/                 # fluxos, RLS, leak entre tenants, logs e audit
│   ├── admin/app/
│   │   ├── signIn/                          # login
│   │   ├── invitation/[token]/                 # accept invitation
│   │   ├── esqueci-senha/                   # solicitar recuperação
│   │   ├── reset-password/[token]/         # nova password
│   │   └── equipe/                          # lista e ações do dono (tela inicial após o login)
│   └── barber/app/
│       └── signIn.tsx                       # login e signOut, token em expo-secure-store
└── packages/
    ├── domain/
    │   ├── src/identity/                  # validatePassword, sessionDuration, lockout de login,
    │   │                                    # vigência de tokens, último dono, normalizarEmail
    │   └── test/identidade/                 # escritos antes da implementação
    └── contracts/
        ├── src/identity/                  # schemas Zod + record de routes
        ├── scripts/openapi.ts               # gera OpenAPI 3.1 a partir do record
        └── test/                            # os schemas aceitam e recusam o expected
```

**Structure Decision**: Mantém o layout da constitution, sem espaços novos. O acesso a dados fica dentro de `apps/api` (e não em um pacote) porque só a API fala com o banco, o que também preserva a regra de que nenhum módulo acessa tabelas de outro contexto. A pasta `identity/` é o bounded context; os demais contextos nascerão em pastas irmãs nas features próprias.

## Complexity Tracking

| Ponto | Por que é necessário | Alternativa mais simples rejeitada porque |
|---|---|---|
| Três funções `SECURITY DEFINER` de propriedade do papel `app_auth` | O login precisa achar usuário, sessão e token **antes** de conhecer o tenant; o e-mail é único no sistema inteiro | Papel com `BYPASSRLS` para o login: um erro de consulta viraria vazamento entre barbearias. `app_auth` não tem login nem `BYPASSRLS`; sua leitura vem de três políticas dedicadas (`*_auth_read`), e quem migra o assume sem herdar (`INHERIT FALSE`). Funções pequenas, fixas e cobertas por teste |
| E-mail enviado após o commit, sem outbox formal (princípio VII) | Um único e-mail de baixo risco por operação, com reenvio disponível ao dono | Tabela outbox e job de despacho: exigem fila e rotina de retentativa que só fazem sentido com jobs reais (princípio X) |
| Limite por origem em memória (`@nestjs/throttler`) | Uma única instância da API nesta fase | Armazenamento no Redis: infraestrutura e testes extras sem necessidade hoje; troca prevista ao escalar ([R8](research.md#r8-bloqueio-de-login-e-limite-de-requisições)) |
| Conexão administrativa nos comandos da equipe do produto | Provisionar cria o tenant e anonimizar age sobre um usuário achado por e-mail, antes de haver contexto | Rodar esses comandos como `app_runtime`: não consegue criar barbearia nem achar usuário sem contexto. Mitigação: contexto explícito (R2) e testes com dono não superusuário |
| `security_events.tenant_id` nulo | Falhas de login de e-mail inexistente não têm barbearia e precisam constar na trilha | Descartar o evento: perde sinal de ataque. Mitigação: a política de leitura esconde esses eventos de toda barbearia e eles não têm dado pessoal |
