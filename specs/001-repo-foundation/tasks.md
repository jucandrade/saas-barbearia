---

description: "Lista de tarefas da feature 001-repo-foundation"
---

# Tasks: Fundação do repositório

**Input**: documentos de design em `/specs/001-repo-foundation/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: a spec pede exatamente dois testes (exemplo de `packages/domain` e `GET /health` da API). Ambos são escritos antes do código que exercitam (princípio IV, test-first). Não há outras tarefas de teste.

**Organization**: tarefas agrupadas por user story. Os caminhos são relativos à raiz do repositório.

## Format: `[ID] [P?] [Story] Descrição`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência de tarefa incompleta)
- **[Story]**: user story a que a tarefa pertence (US1 a US5)

## Phase 1: Setup (raiz do monorepo)

**Purpose**: arquivos de raiz que definem workspaces, versões, fins de linha e orquestração.

- [X] T001 Criar `package.json` da raiz: `private`, `packageManager: "pnpm@10.x.y"` (versão exata do pnpm instalado), `engines.node: ">=24.22.1 <25"` e todos os scripts de [contracts/commands.md](contracts/commands.md) (`dev`, `dev:barber`, `test`, `lint`, `typecheck`, `format`, `format:check`, `build`, `infra:up`, `infra:check`, `infra:down`, `infra:reset`), sem `&&`, `rm -rf` nem variáveis de shell; `infra:*` chamam `docker compose` direto (R13)
- [X] T002 [P] Criar `.nvmrc` com `24.22.1` e `.npmrc` com `engine-strict=true`
- [X] T003 [P] Criar `pnpm-workspace.yaml` com `apps/*` e `packages/*` e a chave `onlyBuiltDependencies` (inicialmente com `esbuild` e `@swc/core`; completar com o resultado de `pnpm approve-builds` em T018 e T033, ver [R1](research.md#r1-nodejs-e-pnpm))
- [X] T004 [P] Criar `.gitattributes` (`* text=auto eol=lf`, binários como `binary`) e `.editorconfig` (`end_of_line = lf`)
- [X] T005 [P] Criar `.gitignore` (`node_modules`, `.turbo`, `dist`, `.next`, `.expo`, `.env`, relatórios de cobertura), mantendo `.env.example` versionado
- [X] T006 [P] Criar `tsconfig.base.json` com `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `isolatedModules`, `skipLibCheck` ([R3](research.md#r3-configuração-compartilhada-sem-pacotes-extras))
- [X] T007 [P] Criar `turbo.json` com `build`, `lint`, `typecheck`, `test` (cache; `dependsOn: ["^build"]` em `build` e `typecheck`) e `dev` (`persistent: true`, `cache: false`)

---

## Phase 2: Foundational (bloqueia todas as user stories)

**Purpose**: pacotes compartilhados vazios e dependências comuns, para que o workspace instale.

**⚠️ CRITICAL**: nenhuma user story começa antes desta fase.

- [X] T008 [P] Criar `packages/domain` (`package.json` `@barbearia/domain` sem dependências de runtime, `tsconfig.json`, `tsconfig.build.json`, `src/index.ts` com `export {}`), com scripts `build`, `lint`, `typecheck` conforme [contracts/commands.md](contracts/commands.md)
- [X] T009 [P] Criar `packages/contracts` (`@barbearia/contracts`, mesma estrutura de T008, `src/index.ts` vazio)
- [X] T010 [P] Criar `packages/ui` (`@barbearia/ui`, mesma estrutura de T008, `src/index.ts` vazio)
- [X] T011 Adicionar `devDependencies` da raiz (`typescript`, `turbo`, `vitest`, `prettier`, `eslint`, `typescript-eslint`) e rodar `pnpm install` para gerar `pnpm-lock.yaml` (depende de T001 a T010)

**Checkpoint**: `pnpm install` conclui e reconhece os três pacotes.

---

## Phase 3: User Story 1 - Clonar, instalar e testar (Priority: P1) 🎯 MVP

**Goal**: `pnpm install` + `pnpm test` passam em Windows e Linux, sem Docker.

**Independent Test**: [quickstart.md](quickstart.md), cenário 1.

- [X] T012 [US1] Escrever primeiro `packages/domain/test/example.spec.ts`: exatamente um teste trivial, sem framework, banco, rede nem relógio (FR-004), com `packages/domain/vitest.config.ts` e script `test` (`vitest run`); confirmar que roda e passa
- [X] T013 [P] [US1] Adicionar `packages/contracts/vitest.config.ts` com `passWithNoTests: true` e script `test`
- [X] T014 [P] [US1] Adicionar `packages/ui/vitest.config.ts` com `passWithNoTests: true` e script `test`
- [X] T015 [US1] Criar o esqueleto de `apps/api`: `package.json` (`@barbearia/api`, NestJS 12, `@nestjs/testing`, `supertest`, `unplugin-swc`, `@swc/core`), `tsconfig.json` e `tsconfig.build.json` (ESM com `module: NodeNext`, `experimentalDecorators`, `emitDecoratorMetadata`), `nest-cli.json`, `vitest.config.ts` com `unplugin-swc` e scripts `dev` (carrega `PORT` do `.env` da raiz se existir, de forma idêntica em PowerShell e bash; validar a flag do Nest CLI ou do Node em T032), `build`, `lint`, `typecheck`, `test` ([R5](research.md#r5-testes-vitest-também-na-api), [R6](research.md#r6-esqueleto-da-api-nestjs))
- [X] T016 [US1] Escrever primeiro `apps/api/test/health.spec.ts` (Vitest + supertest via `Test.createTestingModule`): `GET /health` responde `200` com `{"status":"ok"}` ([contracts/health.md](contracts/health.md)); confirmar que falha por falta da rota
- [X] T017 [US1] Implementar `apps/api/src/app.module.ts`, `apps/api/src/health/health.module.ts`, `apps/api/src/health/health.controller.ts` e `apps/api/src/main.ts` (porta via `PORT`, padrão 3000), sem consultar banco nem fila e sem expor versão ou ambiente; confirmar que T016 passa
- [X] T018 [US1] Rodar `pnpm install` e `pnpm test` na raiz: o teste de `@barbearia/domain` e o de `@barbearia/api` passam, `contracts` e `ui` passam sem testes; confirmar que Node fora de `engines` faz o install falhar (edge case da spec); rodar `pnpm approve-builds` e registrar em `onlyBuiltDependencies` o que for necessário

**Checkpoint**: US1 funcional e demonstrável (MVP).

---

## Phase 4: User Story 2 - Verificação automática a cada push (Priority: P1)

**Goal**: a CI roda os mesmos comandos locais em Linux e Windows e indica a etapa que falhou.

**Independent Test**: [quickstart.md](quickstart.md), cenário 6. A execução verde completa depende de US3 e US4 (ver Dependencies).

- [X] T019 [US2] Criar `.github/workflows/ci.yml` conforme [contracts/ci.md](contracts/ci.md): gatilhos `push` (todas as branches) e `pull_request`; setup comum nomeado (Checkout, Setup pnpm, Setup Node com `node-version-file: .nvmrc` e cache do pnpm, Cache turbo em `.turbo`, `pnpm install --frozen-lockfile`)
- [X] T020 [US2] No mesmo arquivo, job `linux` (`ubuntu-latest`) com passos nomeados `Format check`, `Lint`, `Typecheck`, `Test`, `Build`, `Infra up`, `Infra check` e `Infra down` (`if: always()`) (FR-017, FR-017d, FR-019)
- [X] T021 [US2] No mesmo arquivo, job `windows` (`windows-latest`, `shell: pwsh`) com `Format check`, `Lint`, `Typecheck` e `Test`, sem build e sem contêineres (FR-017c); os dois jobs independentes, sem matriz e sem segredos
- [X] T022 [US2] Validar o workflow localmente sem depender de outras stories: `docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:latest` (ou equivalente) sem erros, e conferir que os nomes dos passos e os comandos batem com [contracts/ci.md](contracts/ci.md). A validação na pipeline real é o T041

**Checkpoint**: workflow escrito e válido; a execução real é validada no T041, depois de US3 e US4.

---

## Phase 5: User Story 3 - Infraestrutura local com um comando (Priority: P2)

**Goal**: Postgres e Redis sobem e descem com um comando cada, preservando dados por padrão.

**Independent Test**: [quickstart.md](quickstart.md), cenário 3.

- [X] T023 [P] [US3] Criar `docker-compose.yml` com `postgres:17-alpine` (`healthcheck` `pg_isready`) e `redis:7.4-alpine` (`healthcheck` `redis-cli ping`), volumes nomeados `postgres-data` e `redis-data`, portas `${POSTGRES_PORT:-5432}` e `${REDIS_PORT:-6379}`, e `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` com padrão `barbearia` ([R9](research.md#r9-verificação-de-banco-e-fila-sem-biblioteca), [data-model.md](data-model.md))
- [X] T024 [P] [US3] Criar `.env.example` com `POSTGRES_PORT=5432`, `POSTGRES_USER=barbearia`, `POSTGRES_PASSWORD=barbearia`, `POSTGRES_DB=barbearia`, `REDIS_PORT=6379`, `PORT=3000` (API), comentando que são credenciais locais de exemplo (FR-015, FR-016)
- [X] T025 [P] [US3] Criar `scripts/infra-check.mjs` em Node puro (`node:net`): `PING` no Redis esperando `+PONG`; `SSLRequest` de 8 bytes no Postgres esperando `S` ou `N`; timeout e retentativa curtos; código de saída ≠ 0 em falha; lê `POSTGRES_PORT` e `REDIS_PORT` do ambiente (carregado por `--env-file-if-exists=.env`)
- [X] T026 [US3] Validar o cenário 3 com Docker: `infra:up` espera os healthchecks, `infra:check` confirma os dois, `infra:up` repetido não duplica, `infra:down` preserva volumes, `infra:reset` apaga; testar também o negativo da porta 5432 ocupada com `POSTGRES_PORT=5433`

**Checkpoint**: US3 funcional de forma independente.

---

## Phase 6: User Story 4 - Padrões de código aplicados localmente (Priority: P2)

**Goal**: format, lint, typecheck e build cobrem os sete espaços com os mesmos comandos da CI; inclui os esqueletos de `admin`, `booking` e `barber` (FR-003, FR-003a) que dão alvo a essas verificações.

**Independent Test**: [quickstart.md](quickstart.md), cenários 2 e 4.

- [X] T027 [P] [US4] Criar `prettier.config.mjs` (`endOfLine: "lf"`) e `.prettierignore` (`node_modules`, `dist`, `.next`, `.turbo`, `.expo`, `pnpm-lock.yaml`)
- [X] T028 [P] [US4] Criar `apps/admin`: `package.json` (`@barbearia/admin`, Next.js 16, React 19; `dev` com `next dev --port 3001`, `build`, `lint`, `typecheck`), `tsconfig.json`, `next.config.ts` com `transpilePackages`, `app/layout.tsx` (`lang="pt-BR"`, viewport mobile) e `app/page.tsx` em branco, sem testes ([R7](research.md#r7-esqueletos-web-nextjs))
- [X] T029 [P] [US4] Criar `apps/booking` com a mesma estrutura de T028, porta `3002`, `app/page.tsx` como server component (sem `"use client"`)
- [X] T030 [P] [US4] Criar `apps/barber`: `package.json` (`@barbearia/barber`, Expo SDK estável mais recente, `expo-router`; `dev` com `expo start`, `build` com `expo export --platform android --platform ios --output-dir dist`, `lint`, `typecheck`), `tsconfig.json` estendendo `expo/tsconfig.base` com os flags de rigor, `app.json`, `app/_layout.tsx` e `app/index.tsx` com tela vazia ([R8](research.md#r8-esqueleto-mobile-expo))
- [X] T031 [US4] Criar `eslint.config.mjs` único na raiz ([R4](research.md#r4-eslint-e-prettier)): `strictTypeChecked` em `packages/*` e `apps/api`, `recommendedTypeChecked` nos apps de UI, `eslint-config-next` para admin e booking, `eslint-config-expo` para barber, `eslint-config-prettier` por último, e `no-restricted-imports` em `packages/domain` proibindo `@nestjs/*`, `next`, `react`, `react-native`, `expo*`, `pg`, `ioredis`, `bullmq` e módulos `node:*` de I/O e tempo; adicionar as dependências de lint à raiz (depende de T028 a T030)
- [ ] T032 [US4] Rodar `pnpm install` e confirmar `pnpm dev:barber` (Metro na 8081, tela vazia) e `pnpm dev` na raiz (api 3000, admin 3001, booking 3002 em até 2 minutos; com `PORT=4000` no `.env` a API sobe na 4000; `/health` responde `200 {"status":"ok"}`; booking vem renderizado do servidor) (SC-007) **Pendente nesta máquina**: `pnpm dev` com Turbopack falha com "OS file watch limit reached" (limite de inotify, 65536, quase todo usado pelo watcher do VS Code); api, admin e booking foram validados com `next dev --webpack` + polling, e o Metro sobe na 8081. Repetir após aumentar `fs.inotify.max_user_watches` (requer sudo)
- [X] T033 [US4] Rodar `pnpm format:check`, `pnpm lint`, `pnpm typecheck` e `pnpm build`; confirmar que geram `apps/api/dist`, `apps/admin/.next`, `apps/booking/.next` e `apps/barber/dist` e que terminam com código 0 (FR-017b)
- [X] T034 [US4] Validar os quatro negativos do cenário 2 (formatação, tipo, import proibido no domínio, teste falhando), desfazendo cada um, e confirmar que `pnpm format` corrige a formatação

**Checkpoint**: verificações locais equivalentes às da CI.

---

## Phase 7: User Story 5 - README como ponto de entrada (Priority: P3)

**Goal**: quem nunca viu o projeto chega a testes passando e infraestrutura no ar só com o README.

**Independent Test**: [quickstart.md](quickstart.md), cenário 7.

- [X] T035 [US5] Criar `README.md` (FR-020) com: pré-requisitos com versões (Git, Node 24 de `.nvmrc`, pnpm de `packageManager`, Docker Desktop no Windows ou Docker Engine com Compose v2 no Linux, necessário só para `infra:*`; nota sobre Podman via `podman-docker`, conforme [R13](research.md#r13-engine-de-contêiner-docker-como-padrão-único)); comandos de instalação, `dev`, `dev:barber`, `build`, `test`, `lint`, `typecheck`, `format`, `format:check`, `infra:up`, `infra:check`, `infra:down`, `infra:reset`; descrição de uma linha de cada um dos sete espaços; como trocar portas (`.env` para infraestrutura e API, `--port` para admin e booking; nenhum comando com sintaxe de shell específica); o que fazer com porta ocupada e com Node em versão errada; sem variante por sistema operacional (SC-006)
- [X] T036 [US5] Pedir a alguém que não participou da feature, ou simular com a máquina limpa, seguir só o README em Windows e Linux e anotar qualquer lacuna; corrigir o README **Feito só no Linux** (simulação com cópia limpa do repositório); a parte Windows foi descartada.

**Checkpoint**: todas as user stories entregues.

---

## Phase 8: Polish & Cross-Cutting

- [X] T037 Garantir que o `docker-compose.yml`, os scripts e o workflow não precisam de segredo, e que `git ls-files` não contém `.env` nem credencial real (FR-016)
- [X] T038 [P] Confirmar o cenário 5 (fins de linha) no Windows com `core.autocrlf true`: clone novo e `pnpm format:check` passam **Descartada**: não há máquina Windows disponível; a paridade fica coberta só pelo job `windows` da CI.
- [ ] T039 Percorrer todo o [quickstart.md](quickstart.md) (cenários 1 a 7) em Windows e Linux e checar SC-001 a SC-007; registrar divergências **Escopo reduzido a Linux**: a parte Windows foi descartada (sem máquina); T032 e T041 seguem pendentes.
- [X] T040 Reavaliar o Constitution Check do [plan.md](plan.md) com os arquivos reais (domínio sem dependências de runtime, nenhum espaço além dos sete, nenhuma biblioteca de banco) e atualizar o plan se algo mudou
- [ ] T041 Validação da US2 na pipeline real (depende de T026 e T033, e de T022): fazer push da branch e confirmar que os jobs `linux` e `windows` passam em até 10 minutos cada (SC-005); repetir em branch descartável com as alterações negativas do [cenário 6](quickstart.md), incluindo a de build, conferindo que falha só a etapa esperada e só o job esperado (SC-004)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (1)** → **Foundational (2)** → user stories.
- **US1** só depende de Foundational e é o MVP.
- **US3** e **US4** dependem de Foundational e são independentes entre si e de US1. US4 reaproveita `apps/api` de US1 para lint, tipos e build.
- **US2** pode ter o workflow escrito (T019 a T021) logo após US1, mas só fica verde (validação no T041, Polish) quando US3 (`infra:*`) e US4 (`format:check`, `lint`, `typecheck`, `build`) existirem, pois o job usa esses comandos.
- **US5** pede os comandos finais existindo; escrever depois de US1, US3 e US4.
- **Polish** é a última fase.

### Ordem sugerida de implementação

Setup → Foundational → US1 → US3 e US4 em paralelo → US2 → US5 → Polish (que inclui a validação da pipeline, T041).

### Dentro das stories

- Testes antes da implementação: T012 antes de qualquer outro código de domínio, T016 antes de T017.
- Esqueletos dos apps (T028 a T030) antes do `eslint.config.mjs` (T031).
- Validações (T018, T022, T026, T032 a T034, T036) por último em cada story; a da pipeline real (T041) fica na Polish.

### Parallel Opportunities

- Setup: T002 a T007 (arquivos distintos, depois de T001 se quiser os scripts primeiro).
- Foundational: T008, T009, T010.
- US1: T013 e T014.
- US3: T023, T024, T025.
- US4: T027 a T030.

## Parallel Example: User Story 4

```text
T027 prettier.config.mjs + .prettierignore
T028 apps/admin
T029 apps/booking
T030 apps/barber
```

## Implementation Strategy

### MVP First (US1)

1. Setup e Foundational.
2. US1: `pnpm install` e `pnpm test` passam em Windows e Linux.
3. Parar e validar o cenário 1 antes de seguir.

### Entrega incremental

1. US1 (MVP) → US3 e US4 (ambiente e padrões) → US2 (CI sobre tudo) → US5 (README) → Polish.
2. Cada story fecha com sua validação do quickstart antes de começar a próxima.

## Notes

- Cada tarefa [P] mexe em arquivos diferentes.
- Os arquivos de raiz do plan.md (`docs/adr/0001-ci-github-actions.md`) já existem; nenhuma tarefa os recria.
- Commitar após cada tarefa ou grupo lógico.
