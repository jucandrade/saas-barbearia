# Implementation Plan: Fundação do repositório

**Branch**: `001-repo-foundation` | **Date**: 2026-10-17 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/001-repo-foundation/spec.md`

## Summary

Criar o monorepo com os sete espaços da constitution, sem regra de negócio, de forma que `pnpm install` + `pnpm test` passem em Windows (PowerShell) e Linux. A orquestração fica com Turborepo sobre workspaces do pnpm; TypeScript strict com uma base compartilhada; ESLint (flat config) e Prettier configurados uma vez na raiz; Vitest em todos os pacotes, inclusive na API; esqueletos mínimos de NestJS (health check), Next.js (página em branco) e Expo (tela vazia); Postgres e Redis locais via Docker Compose; CI no GitHub Actions com um job Linux completo (incluindo subida e verificação da infraestrutura) e um job Windows sem contêineres. Todos os scripts são comandos `pnpm`/`turbo`/Node, sem shell específico de sistema operacional. Detalhes e justificativas em [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript (`strict`) sobre Node.js 24 LTS, versão exata fixada em `.nvmrc` e `engines` ([R1](research.md#r1-nodejs-e-pnpm))

**Primary Dependencies**: pnpm 10 (via `packageManager`), Turborepo 2, NestJS 12 (ESM), Next.js 16 + React 19, Expo SDK 58, ESLint 9 (flat config; o 10 ainda não é aceito pelos plugins do Next e do Expo) + typescript-eslint, Prettier 3. Versões exatas travadas no `pnpm-lock.yaml`. TypeScript fica em 6.0.x (`~6.0.3`) porque o `typescript-eslint` 8.x ainda não aceita o TypeScript 7 (peer `<6.1.0`); revisar quando aceitar.

**Storage**: PostgreSQL e Redis apenas como infraestrutura local (Docker Compose; Docker é o único engine suportado, sem wrapper para Podman, [R13](research.md#r13-engine-de-contêiner-docker-como-padrão-único)), sem esquemas. Nenhum ORM ou driver de banco nesta feature ([R9](research.md#r9-verificação-de-banco-e-fila-sem-biblioteca)).

**Testing**: Vitest em `packages/*` e em `apps/api` (com `unplugin-swc` para metadados de decorators) ([R5](research.md#r5-testes-vitest-também-na-api)); `apps/admin`, `apps/booking` e `apps/barber` sem testes nesta feature.

**Target Platform**: Desenvolvimento em Windows 11 (PowerShell) e Linux; CI em `ubuntu-latest` e `windows-latest`.

**Project Type**: Monorepo (API web + 2 apps web + 1 app mobile + 3 pacotes compartilhados)

**Performance Goals**: Pipeline ≤ 10 min por sistema operacional (SC-005); clone → testes passando ≤ 15 min (SC-001); `pnpm dev` com apps acessíveis ≤ 2 min (SC-007).

**Constraints**: Nenhum script dependente de bash ou PowerShell (FR-009); fins de linha LF normalizados (FR-012); nenhum segredo versionado (FR-016); exatamente os sete espaços da constitution (FR-001), portanto configurações compartilhadas ficam na raiz e não em pacotes extras ([R3](research.md#r3-configuração-compartilhada-sem-pacotes-extras)).

**Scale/Scope**: 7 espaços, ~1 rota, 3 telas em branco, 2 testes (exemplo do domínio + health check da API).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio / Restrição | Status | Observação |
|---|---|---|
| I. Multi-tenancy | N/A | Sem entidades nem queries. RLS e `tenant_id` entram na feature de tenancy. |
| II. Integridade financeira | N/A | Sem valores monetários. |
| III. Regras parametrizáveis | N/A | Sem regras de negócio. |
| IV. Domínio puro e test-first | ✅ | `packages/domain` sem dependências de runtime; Vitest configurado; teste de exemplo escrito antes de qualquer código. Lint proíbe imports de framework/infra no domínio ([R4](research.md#r4-eslint-e-prettier)). |
| V. Contratos primeiro | ✅ (com nota) | `packages/contracts` criado vazio. O health check é endpoint operacional consumido por CI/monitoramento, não por frontends, logo fica fora de `packages/contracts`; seu contrato está documentado em [contracts/health.md](contracts/health.md). |
| VI. Monólito modular | ✅ | `apps/api` em NestJS com apenas o módulo de health; bounded contexts entram nas features próprias. |
| VII. Confiabilidade de jobs | N/A | Redis sobe localmente; nenhuma fila BullMQ configurada. |
| VIII. Mobile-first | ✅ | Páginas em branco com viewport mobile; `apps/booking` renderizado no servidor (App Router, server component). |
| IX. Privacidade e LGPD | ✅ | Sem dados pessoais. `.env` ignorado pelo git; só `.env.example` com credenciais locais de exemplo. |
| X. Simplicidade | ✅ | Sem ORM, sem driver de banco, sem pacotes de config extras, sem hooks de pré-commit. |
| Restrições técnicas (TS strict, Turborepo, NestJS, Next.js, Expo, Postgres, Redis) | ✅ | Seguidas literalmente. |
| Decisão aberta "Hospedagem, CI/CD" | ✅ | Parte de CI resolvida por [ADR 0001](../../docs/adr/0001-ci-github-actions.md). Hospedagem e observabilidade continuam abertas. |
| Fluxo: PR com testes, lint e type-check | ✅ | Garantido pela CI (FR-017 a FR-019). |

**Resultado (pré-pesquisa)**: aprovado, sem violações.
**Resultado (pós-design)**: aprovado, sem violações. Nenhuma entrada em Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/001-repo-foundation/
├── plan.md              # Este arquivo
├── research.md          # Fase 0: decisões e alternativas
├── data-model.md        # Fase 1: sem entidades; inventário de configuração
├── quickstart.md        # Fase 1: roteiro de validação ponta a ponta
├── contracts/
│   ├── commands.md      # Contrato dos comandos da raiz
│   ├── health.md        # Contrato do GET /health
│   └── ci.md            # Contrato dos jobs de CI
└── tasks.md             # Fase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
.
├── .github/workflows/ci.yml        # jobs linux (completo) e windows (sem contêineres)
├── docs/adr/0001-ci-github-actions.md
├── scripts/
│   └── infra-check.mjs             # verifica Postgres e Redis via TCP (Node puro)
├── apps/
│   ├── api/                        # NestJS: AppModule + HealthModule (GET /health)
│   │   ├── src/
│   │   └── test/health.spec.ts     # Vitest + supertest
│   ├── admin/                      # Next.js App Router: app/page.tsx em branco
│   ├── booking/                    # Next.js App Router (SSR): app/page.tsx em branco
│   └── barber/                     # Expo (expo-router): uma tela vazia
├── packages/
│   ├── domain/                     # src/index.ts vazio + test/example.spec.ts
│   ├── contracts/                  # src/index.ts vazio, Vitest com passWithNoTests
│   └── ui/                         # src/index.ts vazio, Vitest com passWithNoTests
├── .editorconfig
├── .gitattributes                  # * text=auto eol=lf
├── .gitignore
├── .vscode/settings.json           # exclui node_modules e saídas de build do watcher do editor
├── .env.example                    # portas e credenciais locais de exemplo
├── .npmrc                          # engine-strict=true
├── .nvmrc                          # versão exata do Node
├── docker-compose.yml              # postgres + redis com healthchecks
├── eslint.config.mjs               # flat config única com overrides por espaço
├── prettier.config.mjs
├── tsconfig.base.json              # strict, estendido por todos os espaços
├── turbo.json
├── pnpm-workspace.yaml
├── package.json                    # scripts da raiz + packageManager + engines
└── README.md
```

**Structure Decision**: Layout definido pela constitution (`apps/*` e `packages/*`). Configurações compartilhadas (TypeScript, ESLint, Prettier) ficam em arquivos na raiz, estendidos ou herdados por cada espaço, para não criar espaços além dos sete exigidos por FR-001. Pacotes são nomeados `@barbearia/<nome>`.

## Complexity Tracking

Nenhuma violação da constitution a justificar.
