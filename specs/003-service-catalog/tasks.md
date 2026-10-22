---

description: "Lista de tarefas da feature 003-service-catalog"
---

# Tasks: Catálogo de serviços

**Input**: documentos de design em `/specs/003-service-catalog/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: incluídos, porque a constitution os exige: domínio em TDD estrito (princípio IV), testes de contrato por endpoint (princípio V) e testes de vazamento entre barbearias (princípio I). Em toda fase, os testes são escritos **antes** do código que exercitam e devem falhar primeiro.

**Organization**: tarefas agrupadas por user story. Os caminhos são relativos à raiz do repositório. Restrições de campo (tamanhos, nulos, enums) estão reproduzidas de [data-model.md](data-model.md) nas tarefas de esquema. Nomes de arquivos, funções e códigos de erro em inglês; só os textos exibidos ao usuário ficam em português.

## Format: `[ID] [P?] [Story] Descrição`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência de tarefa incompleta)
- **[Story]**: user story a que a tarefa pertence (US1 a US5)

## Phase 1: Setup

**Purpose**: confirmar a base antes de começar. A feature não adiciona dependência nem infraestrutura ([R14](research.md#r14-dependências)).

- [X] T001 Confirmar a base: na branch `003-service-catalog`, rodar `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test` e, com `pnpm infra:up` de pé, `pnpm test:integration`; todos devem estar verdes. Se o PR da 002 já tiver sido mergeado, atualizar a branch sobre `001-repo-foundation`: com merge comum, `git rebase 001-repo-foundation`; com squash, `git rebase --onto 001-repo-foundation <último commit da 002> 003-service-catalog` (a branch nasceu sobre a 002). Repetir a conferência depois

---

## Phase 2: Foundational (bloqueia todas as user stories)

**Purpose**: regras puras do domínio em TDD, base dos contratos, esquema do banco com RLS, auditoria, porta de usuários da Identidade e o esqueleto do módulo.

**⚠️ CRITICAL**: nenhuma user story começa antes desta fase.

- [X] T002 [P] Escrever `packages/domain/test/catalog/name.spec.ts` (deve falhar): `normalizeName` apara espaços nas pontas, converte para minúsculas (`toLocaleLowerCase('pt-BR')`), normaliza Unicode para NFC (`é` composto e decomposto geram a mesma chave) e mantém espaços internos; `"Corte "`, `"corte"` e `"CORTE"` geram a mesma chave; `"Barba"` e `"Barba Completa"` geram chaves diferentes
- [X] T003 [P] Escrever `packages/domain/test/catalog/validation.spec.ts` (deve falhar): `validateDuration` aceita 5, 30 e 480 e recusa 0, -5, 4, 37, 485 e não inteiros, devolvendo o motivo (`not_integer`, `out_of_range`, `not_multiple_of_step`); `validatePrice` aceita 0 e 1.000.000 e recusa -1, 1.000.001 e não inteiros (`not_integer`, `out_of_range`); `validateServiceName` e `validateCategoryName` aceitam 1 a 80 caracteres após `trim` e recusam vazio, só espaços e 81 caracteres; `validateDescription` aceita até 500 caracteres, vazio vira `null` e 501 é recusado
- [X] T004 [P] Escrever `packages/domain/test/catalog/terms.spec.ts` (deve falhar): `resolveTerms(service, link)` usa o preço do vínculo quando não nulo e o padrão quando nulo, e o mesmo para a duração, de forma independente (só preço específico, só duração, ambos, nenhum, sem vínculo); devolve a origem de cada campo (`executor` ou `service`); preço específico `0` é válido e vale (não cai no padrão)
- [X] T005 [P] Implementar `packages/domain/src/catalog/name.ts` (`normalizeName`) até os testes de T002 passarem
- [X] T006 [P] Implementar `packages/domain/src/catalog/validation.ts` com as constantes nomeadas `MAX_NAME_LENGTH = 80`, `MAX_DESCRIPTION_LENGTH = 500`, `MIN_DURATION_MINUTES = 5`, `MAX_DURATION_MINUTES = 480`, `DURATION_STEP_MINUTES = 5` e `MAX_PRICE_CENTS = 1_000_000` e as funções de T003, até os testes passarem
- [X] T007 [P] Implementar `packages/domain/src/catalog/terms.ts` (`resolveTerms`) até os testes de T004 passarem
- [X] T008 Criar `packages/domain/src/catalog/index.ts` e exportar em `packages/domain/src/index.ts` (apenas funções puras, sem dependência de runtime; o `lint` valida a pureza do domínio); depende de T005, T006, T007
- [X] T009 Estender o registro de rotas ([R11](research.md#r11-contratos)): em `packages/contracts/src/identity/routes.ts` renomear o registro `ROUTES` para `IDENTITY_ROUTES`, criar `packages/contracts/src/routes.ts` exportando `ROUTES = [...IDENTITY_ROUTES, ...CATALOG_ROUTES]` (com `CATALOG_ROUTES` vazio por enquanto), atualizar os importadores de `ROUTES` e ampliar `HttpMethod` para `"get" | "post" | "put" | "patch" | "delete"`, ajustar `packages/contracts/scripts/openapi.mjs` para os métodos novos e para parâmetros de caminho, e ajustar `apps/api/test/routes.spec.ts` para ler `RequestMethod.PUT`, `PATCH` e `DELETE` dos decoradores; os testes atuais continuam passando
- [X] T010 [P] Criar `packages/contracts/src/catalog/common.ts` com schemas Zod: `ServiceName`, `ServiceDescription`, `DurationMinutes`, `PriceCents` (usando as constantes de `@barbearia/domain`; adicionar a dependência de workspace em `packages/contracts/package.json` se faltar, sem criar ciclo), `ServiceStatus` (`active` | `deactivated`), `ServiceCategory`, `Terms` e os códigos novos de erro de [contracts/api.md](contracts/api.md#convenções); exportar em `packages/contracts/src/index.ts` e cobrir com `packages/contracts/test/catalog-common.spec.ts` (aceita o válido, recusa duração 37, preço 1.000.001, nome de 81 caracteres)
- [X] T011 [P] Criar `apps/api/src/db/schema/service-category.ts`: tabela `service_categories` com `id` uuid PK, `tenant_id` FK → `barbershops.id`, `name` (1 a 80 caracteres), `name_key` texto obrigatório, `position` inteiro, `created_at` e `updated_at`; `UNIQUE (tenant_id, id)`, `UNIQUE (tenant_id, name_key)`, `tenantPolicy` e `.enableRLS()` como em `unit.ts`
- [X] T012 [P] Criar `apps/api/src/db/schema/service.ts`: tabela `services` com `id` uuid PK, `tenant_id`, `category_id`, `name` (1 a 80), `name_key`, `description` texto nulo (até 500), `duration_minutes` inteiro com `CHECK (between 5 and 480 and % 5 = 0)`, `price_cents` inteiro com `CHECK (between 0 and 1000000)`, `status` enum `active` | `deactivated` padrão `active`, `created_at`, `updated_at`; `UNIQUE (tenant_id, id)`, `UNIQUE (tenant_id, name_key)`, FK composta `(tenant_id, category_id)` → `service_categories (tenant_id, id)` com `ON DELETE RESTRICT`; RLS
- [X] T013 [P] Criar `apps/api/src/db/schema/service-executor.ts`: tabela `service_executors` com `tenant_id`, `service_id`, `user_id`, `price_cents` nulo (`CHECK` entre 0 e 1000000 quando presente), `duration_minutes` nulo (`CHECK` entre 5 e 480 e múltiplo de 5 quando presente), `created_at`, `updated_at`; PK `(service_id, user_id)`; FK composta `(tenant_id, service_id)` → `services (tenant_id, id)` e `(tenant_id, user_id)` → `users (tenant_id, id)`; RLS
- [X] T014 [P] Criar `apps/api/src/db/schema/catalog-event.ts`: enum `catalog_event_type` com os 11 tipos de [data-model.md](data-model.md#catalog_events) e tabela `catalog_events` com `id`, `tenant_id`, `type`, `actor_user_id`, `service_id` nulo, `category_id` nulo, `target_user_id` nulo (sem chave estrangeira nos três), `details` jsonb, `created_at`; RLS
- [X] T015 Exportar as quatro tabelas em `apps/api/src/db/schema/index.ts`; adicionar em `apps/api/src/db/schema/user.ts` o índice único `users_tenant_id_id_idx (tenant_id, id)`; depende de T011, T012, T013, T014
- [X] T016 Escrever `apps/api/test/integration/catalog-rls.spec.ts` (deve falhar) e acrescentar `createCategory`, `createService` e `linkExecutor` a `apps/api/test/integration/helpers/factory.ts`: as quatro tabelas têm `ENABLE` e `FORCE ROW LEVEL SECURITY`; sem contexto de tenant nada é lido nem escrito; com o contexto da barbearia A as linhas da B são invisíveis e a escrita nelas é recusada; chave composta recusa serviço com categoria de outra barbearia e vínculo com usuário de outra barbearia mesmo ao escrever com a conexão administrativa; `app_runtime` não consegue `DELETE` em `services`; `catalog_events` recusa `UPDATE`, `DELETE` e `TRUNCATE`; `CHECK`s recusam duração 37, preço negativo e nome de 81 caracteres; depende de T015
- [X] T017 Gerar a migration com `pnpm --filter @barbearia/api db:generate`, renomear para `apps/api/drizzle/0004_catalog.sql` e completar à mão: `FORCE ROW LEVEL SECURITY` nas quatro tabelas; índice único em `users`; `GRANT` mínimo ao `app_runtime` conforme a tabela de [data-model.md](data-model.md#permissões-do-app_runtime-resumo) (sem `DELETE` em `services`, só `SELECT` e `INSERT` em `catalog_events`); função e gatilhos `catalog_events_immutable` (`UPDATE`/`DELETE` por linha e `TRUNCATE` por comando), copiando o desenho de `security_events_immutable` em `0003_integrity-triggers.sql`; rodar `pnpm db:migrate` duas vezes (a segunda não altera nada) e fazer `catalog-rls.spec.ts` passar; depende de T016
- [X] T018 Escrever `apps/api/test/integration/catalog-audit.service.spec.ts` (deve falhar): `CatalogAuditService.record(tx, tenantId, event)` grava na mesma transação da operação (reverter a transação não deixa evento); recusa `details` com chaves proibidas (`email`, `name`, `password`, `token`, `ip`, em qualquer nível); aceita ids, nomes de campos e valores anterior e novo de preço e duração; depende de T017
- [X] T019 Criar `apps/api/src/catalog/catalog-audit.service.ts` até os testes de T018 passarem (mesma verificação de chaves proibidas do `AuditService` da Identidade, sem importar a tabela dela); depende de T018
- [X] T020 Escrever `apps/api/test/integration/user-directory.spec.ts` (deve falhar): `findByIds(tx, ids)` devolve `{ id, name, role, status }` só de usuários da barbearia do contexto; `assertEligibleExecutor(tx, id)` aceita `active` com papel `owner` ou `barber` e recusa `invited`, `deactivated`, `anonymized` e usuário de outra barbearia; nunca devolve e-mail; depende de T017
- [X] T021 Criar `apps/api/src/identity/directory/user-directory.ts` (porta pública, ver [R1](research.md#r1-fronteira-do-módulo-catálogo)) e exportá-la em `IdentityModule` (`apps/api/src/identity/identity.module.ts`) até os testes de T020 passarem; depende de T020
- [X] T022 Criar o esqueleto de `apps/api/src/catalog/catalog.module.ts` (importa `IdentityModule`; provê `CatalogAuditService`; reaproveita o kit HTTP da Identidade como código compartilhado: guards, `@Roles`, `@CurrentUser`, `ZodPipe`, `ResourceIdPipe`, `ApiError` e o `ErrorFilter`, conforme [R1](research.md#r1-fronteira-do-módulo-catálogo)) e registrá-lo em `apps/api/src/app.module.ts`; `pnpm typecheck` e `pnpm test:integration` seguem verdes; depende de T019, T021

**Checkpoint**: domínio, esquema, auditoria e porta de usuários prontos; nenhuma rota ainda.

---

## Phase 3: User Story 1 - Cadastrar e manter os serviços (Priority: P1) 🎯 MVP

**Goal**: o dono cria categorias e serviços, edita todos os dados, reordena categorias e vê a lista agrupada.

**Independent Test**: como dono, criar duas categorias e três serviços, editar o preço de um e conferir a lista atualizada e agrupada; barbeiro e visitante não conseguem alterar (cenário 2 do quickstart).

- [X] T023 [P] [US1] Escrever `packages/contracts/test/catalog-categories-services.spec.ts` (deve falhar): `CreateCategoryInput`, `RenameCategoryInput`, `OrderInput`, `CreateServiceInput` e `UpdateServiceInput` aceitam o válido e recusam nome vazio ou de 81 caracteres, duração 37 ou 600, preço negativo ou 1.000.001 e `UpdateServiceInput` vazio; `description: null` é aceito em `UpdateServiceInput`
- [X] T024 [US1] Criar `packages/contracts/src/catalog/categories.ts` e `services.ts` com os schemas de entrada e saída dos endpoints 1 a 9 de [contracts/api.md](contracts/api.md) (`executorCount` opcional, só para o dono) e `packages/contracts/src/catalog/routes.ts` com `CATALOG_ROUTES` desses endpoints (acesso `session` ou `owner`, erros), já incluído em `ROUTES` por `packages/contracts/src/routes.ts` (T009), até T023 passar; depende de T009, T010, T023
- [X] T025 [US1] Escrever `apps/api/test/integration/catalog-categories.spec.ts` (deve falhar): dono cria categoria (entra no fim); nome repetido ignorando maiúsculas e espaços responde `409 CATEGORY_NAME_TAKEN`; mesmo nome em outra barbearia é aceito; renomear não altera os serviços; `PUT /service-categories/order` com a lista completa reordena e com ids faltando, sobrando ou repetidos responde `400 INVALID_ORDER`; `DELETE` de categoria vazia responde `204` e de categoria com serviço ativo **ou desativado** responde `409 CATEGORY_NOT_EMPTY`; barbeiro recebe `403 NO_PERMISSION` em toda escrita e `200` na leitura; sem sessão `401`; cada operação grava o evento esperado em `catalog_events`; depende de T022, T024
- [X] T026 [US1] Escrever `apps/api/test/integration/catalog-services.spec.ts` (deve falhar): dono cria serviço e ele aparece na lista com os dados informados; `description` vazia vira `null`; campos inválidos respondem `400 INVALID_DATA` com cada problema em `fields`, com a mensagem em português (nome vazio ou longo, duração 37, 4 e 485, preço -1 e 1.000.001, categoria inexistente ou de outra barbearia); a lista vem ordenada por posição da categoria e depois por nome; nome repetido (`corte ` vs `Corte`) responde `409 SERVICE_NAME_TAKEN`; duas criações simultâneas do mesmo nome (`Promise.all`) resultam em uma `201` e uma `409`; `PATCH` altera só os campos enviados e `description: null` limpa; mudar de categoria funciona; serviço gratuito (preço 0) é aceito; barbeiro e visitante não escrevem; `GET /services/{id}` de outra barbearia responde `404`; eventos `service_created` e `service_updated` trazem antes e depois de preço e duração; depende de T022, T024
- [X] T027 [P] [US1] Escrever os testes de contrato em `apps/api/test/integration/contract/` (`category-list`, `category-create`, `category-rename`, `category-order`, `category-delete`, `service-list`, `service-create`, `service-get`, `service-update`, cada um `*.contract.spec.ts`) validando respostas de sucesso e de erro contra os schemas de `@barbearia/contracts`, no padrão de `helpers/contract.ts`, e conferindo que o campo `message` dos erros está em português (FR-019); depende de T024
- [X] T028 [US1] Criar `apps/api/src/catalog/categories/categories.service.ts` (listar, criar, renomear, reordenar, remover; `name_key` por `normalizeName`; `position = max + 1` na criação; checagem de serviços antes de remover; violação `23505` vira `CATEGORY_NAME_TAKEN`, via `pgCode`; evento na mesma transação; tudo por `TenantDb.transaction`, hora por `Clock`) até T025 passar; depende de T025
- [X] T029 [US1] Criar `apps/api/src/catalog/categories/categories.controller.ts` (`GET` com `@Roles("owner", "barber")`, escritas com `@Roles("owner")`, `ZodPipe` nas entradas, `ResourceIdPipe` nos ids, mensagens de erro em português) e registrar no `CatalogModule` e acrescentar o controlador à lista `CONTROLLERS` de `apps/api/test/routes.spec.ts` (sem isso o teste não cobre as rotas do catálogo); `routes.spec.ts` confere o registro; depende de T028
- [X] T030 [US1] Criar `apps/api/src/catalog/services/services.service.ts` (listar na visão do dono com filtro `status` e ordem por categoria e nome, criar, obter, editar parcialmente; validação pelas funções do domínio; `name_key`; `mine: false` e `effective` igual ao padrão por enquanto; evento com antes e depois de preço e duração) até T026 passar; depende de T026, T028
- [X] T031 [US1] Criar `apps/api/src/catalog/services/services.controller.ts` (`GET /services`, `POST`, `GET /:id`, `PATCH /:id`), registrar no `CatalogModule` e acrescentá-lo à lista `CONTROLLERS` de `apps/api/test/routes.spec.ts`; depende de T030
- [ ] T032 [US1] Criar `apps/admin/app/catalog/page.tsx` e `catalog.tsx` (somente dono; lista agrupada por categoria na ordem definida; botão para cada categoria: renomear, subir, descer, remover com confirmação; erros `CATEGORY_NOT_EMPTY` e de nome repetido em português), acrescentar as funções do catálogo a `apps/admin/lib/api.ts` e o link "Catálogo" em `apps/admin/app/header.tsx`; mobile-first; depende de T029, T031
- [ ] T033 [US1] Criar `apps/admin/app/catalog/service-form.tsx` (criar e editar: nome, descrição, categoria, duração em múltiplos de 5, preço em reais convertido para centavos inteiros sem ponto flutuante; erros por campo em português) e ligá-lo à tela de T032; depende de T032

**Checkpoint**: o teste independente da história passa; `pnpm test`, `pnpm lint` e `pnpm typecheck` verdes.

---

## Phase 4: User Story 2 - Desativar e reativar serviços (Priority: P1)

**Goal**: o dono tira um serviço de circulação sem perder histórico e o recoloca depois; serviços nunca são apagados.

**Independent Test**: desativar um serviço, ver que sai das opções ativas e fica na lista de desativados; reativar e ver tudo igual (cenário 3 do quickstart).

- [ ] T034 [US2] Escrever `apps/api/test/integration/catalog-deactivation.spec.ts` (deve falhar): desativar muda o status e some da lista do barbeiro e de `GET /services/{id}` dele (`404`), mas o dono vê com `status=deactivated`; reativar devolve; repetir qualquer das duas é idempotente (`204`, sem novo evento); editar serviço desativado é permitido; o nome de um serviço desativado continua reservado (criar outro com o mesmo nome responde `409`); ciclo desativar/reativar deixa a linha do serviço idêntica à anterior exceto `updated_at` (SC-005); não existe `DELETE /services/{id}` (a rota responde `404`); eventos `service_deactivated` e `service_reactivated`; barbeiro recebe `403`; depende de T031
- [ ] T035 [P] [US2] Escrever `apps/api/test/integration/contract/service-deactivate.contract.spec.ts` e `service-reactivate.contract.spec.ts` (endpoints 10 e 11) e acrescentar as duas rotas a `CATALOG_ROUTES` em `packages/contracts/src/catalog/routes.ts`; depende de T031
- [ ] T036 [US2] Implementar `deactivate` e `reactivate` em `services.service.ts` e as duas rotas `POST /services/:id/deactivate|reactivate` (`204`, `@Roles("owner")`) em `services.controller.ts`; aplicar a regra de visibilidade do barbeiro (só `active`) na lista e no `GET /:id`, até T034 passar; depende de T034
- [ ] T037 [US2] Em `apps/admin/app/catalog/`, adicionar o botão Desativar/Reativar por serviço (com confirmação), a seção "Desativados" recolhível e a ausência de qualquer ação de apagar; depende de T036

**Checkpoint**: as histórias 1 e 2 funcionam juntas e independentes.

---

## Phase 5: User Story 3 - Definir quem executa cada serviço (Priority: P2)

**Goal**: o dono vincula usuários ativos (barbeiro ou o próprio dono) aos serviços; a lista sinaliza serviços sem executor.

**Independent Test**: vincular um serviço a dois dos três usuários e conferir a consulta de executores; remover um vínculo e conferir; ver o serviço sem executor sinalizado (cenário 4).

- [ ] T038 [P] [US3] Criar `packages/contracts/src/catalog/executors.ts` (`ExecutorInput` com `priceCents` e `durationMinutes` opcionais e anuláveis, `Executor`, `ExecutorsOutput`) e os endpoints 12 a 14 em `CATALOG_ROUTES`, com teste em `packages/contracts/test/catalog-executors.spec.ts` (valores específicos seguem os mesmos limites; `null` é aceito); depende de T010
- [ ] T039 [US3] Escrever `apps/api/test/integration/catalog-executors.spec.ts` (deve falhar): dono vincula barbeiro e a si mesmo; vincular usuário `invited`, `deactivated`, `anonymized` responde `409 EXECUTOR_NOT_ELIGIBLE` e de outra barbearia responde `404`; vínculo repetido é idempotente; `DELETE` do vínculo é idempotente; a lista de executores só traz usuários `active`, nunca e-mail; desativar o usuário o tira da lista e reativá-lo devolve vínculo e valores; `executorCount` na lista do dono conta só executores ativos e fica `0` para serviço sem executor; ciclo desativar/reativar o serviço preserva os vínculos (SC-005); eventos `executor_linked` e `executor_unlinked` sem nome nem e-mail; barbeiro não escreve; depende de T036, T038
- [ ] T040 [P] [US3] Escrever `apps/api/test/integration/contract/executor-list.contract.spec.ts`, `executor-link.contract.spec.ts` e `executor-unlink.contract.spec.ts` (endpoints 12 a 14); depende de T038
- [ ] T041 [US3] Criar `apps/api/src/catalog/executors/executors.service.ts` (vincular com `UserDirectory.assertEligibleExecutor`, atualizar valores validados pelo domínio, desvincular, listar com `UserDirectory.findByIds` filtrando `active`) e `executors.controller.ts` (`GET`, `PUT`, `DELETE`), e acrescentar `executorCount` à lista do dono em `services.service.ts`, até T039 passar; registrar no `CatalogModule` e acrescentar o controlador à lista `CONTROLLERS` de `apps/api/test/routes.spec.ts`; depende de T039
- [ ] T042 [US3] Em `apps/admin/app/catalog/`, criar `executors-panel.tsx` (lista de usuários ativos com caixas de seleção para vincular e desvincular; selo "Sem executor" nos serviços ativos com `executorCount` 0) e ligá-lo ao serviço; depende de T041

**Checkpoint**: histórias 1, 2 e 3 funcionam de forma independente.

---

## Phase 6: User Story 5 - Consultar o catálogo (Priority: P2)

**Goal**: dono e barbeiro consultam o catálogo; o barbeiro vê todos os serviços ativos com os dele marcados e os valores que valem para ele, sem alterar nada.

**Independent Test**: como barbeiro, listar o catálogo, ver só serviços ativos da barbearia com os seus marcados; tentar alterar e ser negado; usuário de outra barbearia não vê nada (cenário 6).

- [ ] T043 [US5] Escrever `apps/api/test/integration/catalog-visibility.spec.ts` (deve falhar): o barbeiro lista só serviços ativos, todos da barbearia, com `mine` verdadeiro nos que executa; `effective` traz o preço e a duração específicos dele quando existem (inseridos pela fábrica) e o padrão nos demais; dois barbeiros com valores diferentes no mesmo serviço veem cada um o seu; o dono que também é executor vê `mine` e `effective` próprios; `GET /services/{id}/executors` para barbeiro traz `userId` e `name` dos colegas mas omite os valores específicos dos outros; sem sessão `401`; usuário de outra barbearia não vê nenhum serviço nem categoria; depende de T041
- [ ] T044 [US5] Em `services.service.ts`, calcular `mine` e `effective` com `resolveTerms` a partir do vínculo do chamador (uma consulta com `LEFT JOIN` ao vínculo, sem consulta por item) e, em `executors.service.ts`, omitir os valores específicos para quem não é dono nem o próprio executor, até T043 passar; depende de T043
- [ ] T045 [US5] No app do barbeiro, criar `apps/barber/app/catalog.tsx` (somente leitura: serviços ativos agrupados por categoria, os dele destacados, preço e duração de `effective`, preço em reais com centavos inteiros convertidos), acrescentar as chamadas a `apps/barber/lib/api.ts` e o acesso a partir de `apps/barber/app/index.tsx`; depende de T044

**Checkpoint**: histórias 1, 2, 3 e 5 completas.

---

## Phase 7: User Story 4 - Preço e duração específicos por executor (Priority: P3)

**Goal**: o dono define valores próprios por executor; a consulta devolve o específico ou o padrão, de forma independente para preço e duração.

**Independent Test**: definir preço específico para um barbeiro, consultar e ver o específico para ele e o padrão para os demais; remover e ver o retorno ao padrão (cenário 5).

- [ ] T046 [P] [US4] Criar `packages/contracts/src/catalog/terms.ts` (`TermsOutput` com `priceCents`, `durationMinutes`, `priceSource`, `durationSource`) e o endpoint 15 em `CATALOG_ROUTES`, com teste em `packages/contracts/test/catalog-terms.spec.ts`; depende de T010
- [ ] T047 [US4] Escrever `apps/api/test/integration/catalog-terms.spec.ts` (deve falhar): só preço específico (duração padrão), só duração específica, ambos, nenhum; preço específico `0` vale; mudar o padrão do serviço não altera o valor específico; `null` limpa e volta ao padrão; valor específico inválido (duração 37, preço 1.000.001) responde `400`; `executor_updated` traz antes e depois; `GET /services/{id}/terms?userId=` devolve o mesmo que `CatalogFacade.resolveTerms`; usuário que não é executor ativo, serviço de outra barbearia e serviço desativado consultado por barbeiro respondem `404`; o dono consulta serviço desativado; depende de T041, T046
- [ ] T048 [P] [US4] Escrever `apps/api/test/integration/contract/service-terms.contract.spec.ts` (endpoint 15); depende de T046
- [ ] T049 [US4] Criar `apps/api/src/catalog/catalog.facade.ts` (`resolveTerms(tx, serviceId, userId)` com `resolveTerms` do domínio; exportada pelo `CatalogModule` para a agenda e a comanda) e a rota `GET /services/:id/terms` (`@Roles("owner", "barber")`, `userId` obrigatório, `ResourceIdPipe`) no controlador de serviços (já na lista `CONTROLLERS` de `routes.spec.ts`), até T047 passar; depende de T047
- [ ] T050 [US4] Em `apps/admin/app/catalog/executors-panel.tsx`, adicionar por executor os campos opcionais de preço e duração (em branco = padrão; remover volta ao padrão) e mostrar o valor aplicável; depende de T049, T042

**Checkpoint**: todas as histórias funcionam.

---

## Phase 8: Polish e validação

**Purpose**: vazamento entre barbearias, auditoria completa, desempenho, contratos, documentação e validação na pipeline.

- [ ] T051 Escrever `apps/api/test/integration/catalog-leak.spec.ts`: com dados nas barbearias A e B, cada um dos 15 endpoints chamado como usuário de B com ids de A responde `404` ou lista vazia, nunca dados de A, e nenhuma escrita de B altera linhas de A (tabela por tabela); depende de T049
- [ ] T052 Escrever `apps/api/test/integration/catalog-audit-full.spec.ts`: percorre as operações do catálogo e confirma um evento de cada um dos 11 tipos com autor e horário, `details` sem e-mail, nome de pessoa, senha, token nem IP; confirma que novas alterações nunca apagam nem reescrevem eventos anteriores (SC-007); captura o logger e confirma que nenhum log contém dado pessoal; depende de T049
- [ ] T053 Escrever `apps/api/test/integration/catalog-performance.spec.ts` (SC-006): com 100 serviços em 10 categorias e 5 executores, `GET /services` responde em uma única consulta ao banco (contar as consultas) e em menos de 500 ms no servidor de teste (proxy do SC-006: mede só o lado do servidor; o tempo em conexão móvel é conferido à mão no [quickstart.md](quickstart.md)); depende de T044
- [ ] T054 Rodar `pnpm --filter @barbearia/contracts openapi` e conferir que o documento tem os 15 endpoints novos e que `routes.spec.ts` (contratos e API) garante que toda rota dos três controladores do catálogo está no registro com o mesmo acesso; depende de T049
- [ ] T055 Atualizar `README.md` com a seção do catálogo (o que a feature entrega, onde ficam as telas, a regra de que serviço não se apaga) e conferir que o `.env.example` não precisa de variável nova; depende de T054
- [ ] T056 Rodar `pnpm format`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` e, com a infraestrutura de pé, `pnpm test:integration` na raiz; corrigir o que falhar; `pnpm test` deve passar **sem** banco; depende de T051, T052, T053, T055
- [ ] T057 Percorrer o [quickstart.md](quickstart.md) (cenários 1 a 7) em Linux, conferir SC-001 a SC-007 e registrar divergências; depende de T056
- [ ] T058 Validar na pipeline real: push da branch e conferir `linux` (com `Migrate` e `Integration test`) e `windows` passando; em branch descartável enfraquecer uma política de RLS das tabelas do catálogo (`USING (true)`) e confirmar que falha só `Integration test`, só em `linux`; apagar a branch descartável; depende de T057
- [ ] T059 Reavaliar o Constitution Check de [plan.md](plan.md) com os arquivos reais (RLS e `FORCE` nas quatro tabelas, ausência de `DELETE` em `services`, domínio sem dependências de runtime, nenhum acesso do catálogo à tabela `users`, nenhum dado pessoal em eventos) e atualizar o plan se algo mudou; depende de T057
- [ ] T060 Atualizar a nota de memória do projeto (`project-003-service-catalog`) com o estado final, o mapa de nomes em inglês e as decisões não óbvias (chave composta, `catalog_events`, visão do barbeiro); depende de T058, T059

---

## Dependências e ordem de execução

- **Setup** (T001): primeiro; confirma a base.
- **Foundational** (T002–T022): depende do Setup e **bloqueia todas as histórias**. Dentro dela: testes do domínio (T002–T004) antes das implementações (T005–T007); esquema (T011–T014) antes de T015; teste de RLS (T016) antes da migration (T017); T017 antes de auditoria (T018–T019) e porta de usuários (T020–T021); T022 por último.
- **US1** depende só da Foundational e é o MVP. **US2** depende de US1 (mesmo serviço e controlador). **US3** depende de US2 para a visibilidade do barbeiro e de T021 para a elegibilidade. **US5** depende de US3 (precisa de executores). **US4** depende de US3 (valores vivem no vínculo) e de T042 para a tela.
- **Polish** depende das histórias que quiser validar; T058 (pipeline) precisa dos testes de integração existirem.

### Ordem sugerida das histórias

US1 → US2 → US3 → US5 → US4. A ordem segue a dependência de código; US5 (P2) vem antes de US4 (P3) por prioridade e porque `effective` funciona só com o padrão, sem depender dos valores específicos serem editáveis pela API.

## Oportunidades de paralelismo

- Foundational: os três testes de domínio (T002–T004) em paralelo, depois as três implementações (T005–T007) em paralelo; os quatro arquivos de esquema (T011–T014) em paralelo; T010 independe do restante do banco.
- Por história: os contratos (T023/T024, T038, T046) e os testes de contrato por endpoint andam em paralelo com a escrita dos testes de integração; as telas do admin e do barbeiro andam em paralelo com a API depois que o contrato existe.

## Estratégia de implementação

1. **MVP = Setup + Foundational + US1**: o dono cadastra categorias e serviços e vê o catálogo. Já valida RLS, esquema, auditoria e contrato de ponta a ponta.
2. **US2** adiciona desativar e reativar (a garantia de nunca apagar); **US3** liga quem executa; **US5** abre a leitura ao barbeiro com o app; **US4** fecha com os valores específicos e a consulta de `terms` que a agenda e a comanda usarão.
3. Fazer commit ao fim de cada história, depois de `pnpm format:check`, `pnpm lint`, `pnpm typecheck` e `pnpm test` verdes (e `pnpm test:integration` quando houver infraestrutura).
