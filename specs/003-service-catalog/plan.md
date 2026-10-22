# Implementation Plan: Catálogo de serviços

**Branch**: `003-service-catalog` | **Date**: 2026-10-22 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/003-service-catalog/spec.md`

## Summary

Cria o contexto "Cadastros" (catálogo) sobre a base da 002: categorias gerenciadas pelo dono, serviços com preço e duração padrão, executores por serviço e valores específicos opcionais por executor. Serviços nunca são apagados (o papel do banco nem recebe `DELETE` na tabela). O isolamento segue o mesmo desenho da 002: `tenant_id` + RLS com `FORCE`, contexto por transação e falha fechada, com chaves estrangeiras **compostas** `(tenant_id, id)` para que nenhum vínculo cruze barbearias. As regras puras (validação de duração e preço, normalização do nome, preço e duração aplicáveis a um executor) vão para `packages/domain` em TDD. O catálogo é um módulo Nest próprio (`CatalogModule`) e lê usuários apenas por uma porta pública da Identidade (`UserDirectory`), sem tocar nas tabelas dela. A trilha de auditoria é uma tabela própria e imutável (`catalog_events`). Escrita só para o dono; leitura para dono e barbeiro. Detalhes e alternativas em [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript (`strict`) sobre Node.js 24 LTS, como na 001 e 002.

**Primary Dependencies**: nenhuma nova. Reaproveita `drizzle-orm`, `pg`, `zod` 4, NestJS 12, Next.js 16, Expo SDK 58 e Vitest 5 ([R14](research.md#r14-dependências)).

**Storage**: PostgreSQL 17 com RLS (o da 002), mesmo par de papéis (`app_runtime` na API, dono do esquema nas migrations). Quatro tabelas novas, uma migration (`0004_catalog.sql`) ([R2](research.md#r2-isolamento-e-integridade-entre-tenants)).

**Testing**: Vitest. Unitários em `packages/domain` e `packages/contracts` (sem banco, Linux e Windows). Integração em `apps/api` contra o Postgres do Compose, com migrations reais e suíte de vazamento entre tenants estendida às tabelas novas ([R13](research.md#r13-testes)). Sem teste de interface além de tipos e lint, como na 002.

**Target Platform**: Desenvolvimento em Windows 11 e Linux; CI em `ubuntu-latest` e `windows-latest`. Integração roda só no Linux.

**Project Type**: Monorepo existente; esta feature toca `apps/api`, `apps/admin`, `apps/barber`, `packages/domain` e `packages/contracts`.

**Performance Goals**: lista do catálogo com 100 serviços em menos de 2 segundos em conexão móvel (SC-006), obtida com uma única consulta por requisição e sem paginação ([R9](research.md#r9-listagem-e-visão-do-barbeiro)); consulta de preço e duração de um executor em uma consulta simples.

**Constraints**: RLS com falha fechada nas quatro tabelas; `DELETE` inexistente em `services` (FR-005); valores monetários em centavos inteiros, sem ponto flutuante (constitution II); nenhum dado pessoal nos eventos de auditoria (princípio IX); mensagens ao usuário em português; `pnpm test` da raiz continua sem exigir banco; comandos iguais em PowerShell e bash.

**Scale/Scope**: 4 tabelas, 15 endpoints, 11 tipos de evento de auditoria, 1 tela de gestão no admin (com formulário de serviço e painel de executores) e 1 tela de consulta no app do barbeiro. Dezenas de serviços por barbearia (SC-006 testa 100).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio / Restrição | Status | Observação |
|---|---|---|
| I. Multi-tenancy | ✅ | `tenant_id` e RLS com `FORCE` nas quatro tabelas; API sem `BYPASSRLS`; falha fechada; chaves estrangeiras compostas impedem vínculo entre tenants mesmo com bug de aplicação ([R2](research.md#r2-isolamento-e-integridade-entre-tenants)); suíte de vazamento cobre as tabelas e os endpoints novos ([R13](research.md#r13-testes)). O catálogo é por barbearia, não por unidade (spec FR-017), então não há `unit_id`. |
| II. Integridade financeira | ✅ | Preço em centavos inteiros, `CHECK` no banco entre 0 e 1.000.000. Não há ledger aqui. O snapshot na conclusão da comanda é da feature da comanda; esta feature só garante que os valores atuais são consultáveis de forma determinística (FR-010, FR-015). |
| III. Regras parametrizáveis | N/A | Limites de nome, preço e duração são regras de validação de cadastro, não de remuneração; ficam como constantes nomeadas no domínio. |
| IV. Domínio puro e test-first | ✅ | Validação de duração e preço, normalização de nome e resolução de preço e duração aplicáveis são funções puras em `packages/domain`, com testes escritos antes ([R10](research.md#r10-regras-puras-em-packagesdomain)). Sem golden test: não há cálculo financeiro de fechamento. |
| V. Contratos primeiro | ✅ | Schemas Zod em `packages/contracts` antes da API; registro de rotas e OpenAPI 3.1 gerados deles; o registro ganha os métodos `put`, `patch` e `delete` ([R11](research.md#r11-contratos), [contracts/api.md](contracts/api.md)). Testes de contrato por endpoint. |
| VI. Monólito modular | ✅ (com nota) | Novo `CatalogModule` (contexto "Cadastros"). Não acessa tabelas da Identidade: lê usuários pela porta `UserDirectory` exportada por ela ([R1](research.md#r1-fronteira-do-módulo-catálogo)). A chave estrangeira para `users` existe no banco, só como integridade referencial. Reaproveita o kit HTTP da Identidade (`ApiError`, pipes, decoradores e filtro de erros) como código compartilhado, sem acessar dados dela. Registrado em Complexity Tracking. |
| VII. Confiabilidade de integrações e jobs | N/A | Sem webhooks, jobs nem e-mail. Toda escrita grava evento com autor e horário na mesma transação (trilha de auditoria). |
| VIII. Mobile-first e simplicidade | ✅ | Tela do barbeiro no app, só leitura, organizada pela tarefa "o que posso atender e por quanto"; tela do dono responsiva. |
| IX. Privacidade e LGPD | ✅ | Eventos só com identificadores e nomes de campos, sem nome nem e-mail de pessoas ([R6](research.md#r6-trilha-de-auditoria)). A lista de executores devolve apenas `id` e `name` do usuário, nunca e-mail, e é a única exposição de nome de colega a um barbeiro. |
| X. Simplicidade e entrega por fases | ✅ | Sem preço por unidade, pacotes, produtos, promoções nem importação. Sem biblioteca nova. |
| Restrições técnicas (TS strict, NestJS, PostgreSQL com RLS, Next.js, Expo) | ✅ | Seguidas. |
| Decisões abertas (gateway, hospedagem) | N/A | Não usadas por esta feature. |
| Fluxo: PR com testes, lint e type-check | ✅ | A CI da 002 já roda `Migrate` e `Integration test`; nenhuma etapa nova. |

**Resultado (pré-pesquisa)**: aprovado, sem decisão aberta bloqueante.
**Resultado (pós-design)**: aprovado, com quatro notas justificadas em Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/003-service-catalog/
├── plan.md              # Este arquivo
├── research.md          # Fase 0: decisões e alternativas (R1 a R14)
├── data-model.md        # Fase 1: tabelas, RLS, permissões, regras
├── quickstart.md        # Fase 1: roteiro de validação ponta a ponta
├── contracts/
│   └── api.md           # Contrato dos 15 endpoints do catálogo
├── checklists/
│   └── requirements.md  # Qualidade da spec
└── tasks.md             # Fase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
.
├── apps/
│   ├── api/
│   │   ├── drizzle/0004_catalog.sql            # tabelas, RLS, permissões, gatilho de imutabilidade, unique em users
│   │   ├── src/
│   │   │   ├── db/schema/                      # + service-category, service, service-executor, catalog-event
│   │   │   ├── identity/
│   │   │   │   └── directory/user-directory.ts # porta pública: usuários por id e elegibilidade (novo)
│   │   │   ├── catalog/                        # CatalogModule
│   │   │   │   ├── catalog.module.ts
│   │   │   │   ├── categories/                 # controller + service
│   │   │   │   ├── services/                   # controller + service (CRUD, desativar, reativar, lista)
│   │   │   │   ├── executors/                  # controller + service (vínculos, valores específicos, terms)
│   │   │   │   ├── catalog-audit.service.ts    # grava catalog_events
│   │   │   │   └── catalog.facade.ts           # API pública para a agenda e a comanda (resolveTerms)
│   │   │   └── app.module.ts                   # + CatalogModule
│   │   └── test/
│   │       ├── integration/contract/           # um teste por endpoint novo
│   │       └── integration/                    # catalog-rls, catalog-leak, catalog-flows, catalog-audit
│   ├── admin/app/
│   │   └── catalog/                            # gestão do dono: categorias, serviços, executores
│   └── barber/app/
│       └── catalog.tsx                         # consulta somente leitura
└── packages/
    ├── domain/
    │   ├── src/catalog/                        # validateDuration, validatePrice, normalizeName, resolveTerms
    │   └── test/catalog/                       # escritos antes da implementação
    └── contracts/
        ├── src/catalog/                        # schemas Zod + registro de rotas do catálogo
        └── test/                               # os schemas aceitam e recusam o esperado
```

**Structure Decision**: Mantém o layout da constitution. O catálogo vive em `apps/api/src/catalog`, pasta irmã de `identity/`, como a 002 já previa para os demais contextos. O acesso a dados fica dentro de `apps/api`. A única mudança em código da Identidade é a nova porta `UserDirectory` e, no banco, um índice único `(tenant_id, id)` em `users`.

## Complexity Tracking

| Ponto | Por que é necessário | Alternativa mais simples rejeitada porque |
|---|---|---|
| Módulo `CatalogModule` separado com porta `UserDirectory` da Identidade | Princípio VI: um contexto não lê tabelas de outro; o catálogo precisa saber se um usuário é elegível como executor e o nome dele | Consultar `users` direto do catálogo: acopla os contextos e esconde a regra de elegibilidade fora da Identidade |
| Tabela própria `catalog_events` em vez de estender `security_events` | Os eventos de segurança são da Identidade, com tipo e política próprios; misturar obriga a Identidade a conhecer eventos de catálogo | Reusar `security_events` com mais tipos: mudaria enum, política e testes da 002 e quebraria a fronteira entre contextos |
| Chaves estrangeiras compostas `(tenant_id, id)` e índice único `(tenant_id, id)` em `users` | Garantir no banco que serviço, categoria e executor são do mesmo tenant, além da RLS; uma linha cruzada seria vazamento | Chave simples com validação só na aplicação: um bug de aplicação passaria. O índice adicional em `users` é apenas leitura de integridade, sem mudar dados |
| Catálogo importa o kit HTTP da Identidade (`ApiError`, `ZodPipe`, `ResourceIdPipe`, `@Roles`, `@CurrentUser`, filtro de erros) | Evitar duplicar a convenção de erro, validação e autorização que a 002 já fixou; é código sem estado e sem acesso a dados | Copiar o kit para o catálogo: duas convenções de erro divergiriam. Mover o kit para uma pasta comum agora é refatoração da 002 sem ganho nesta feature; fica como candidato a ADR se um terceiro contexto o usar |
| Registro de rotas ganha `put`, `patch` e `delete` | Vínculos e valores específicos são recursos idempotentes; `POST` para tudo esconderia a semântica | Manter só `get`/`post`: contrato menos honesto e `DELETE` de categoria e de vínculo viraria ação com nome inventado |
