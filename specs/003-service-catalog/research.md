# Research: Catálogo de serviços

Decisões da Fase 0. Cada uma segue o formato Decisão / Racional / Alternativas. Pontos já resolvidos na 002 (RLS, papéis do banco, `TenantDb`, sessão, `Clock`, formato de erro) são reaproveitados sem rediscussão.

## R1. Fronteira do módulo catálogo

**Decisão**: novo `CatalogModule` em `apps/api/src/catalog`, contexto "Cadastros". Ele nunca consulta `users`. A Identidade exporta uma porta `UserDirectory` (em `identity/directory/user-directory.ts`) com duas operações: `findByIds(tx, ids)` devolvendo `{ id, name, role, status }`, e `assertEligibleExecutor(tx, id)` que recusa usuário que não seja `active` com papel `owner` ou `barber` da barbearia do contexto. O catálogo expõe `CatalogFacade.resolveTerms(tx, serviceId, userId)` para a agenda e a comanda.

**Racional**: princípio VI. A regra "quem pode ser executor" é da Identidade (status e papel vivem lá) e muda num lugar só.

**Kit HTTP compartilhado**: por código (não por dados), o catálogo importa de `identity/` o `ApiError`, `ZodPipe`, `ResourceIdPipe`, os decoradores `@Roles` e `@CurrentUser` e o `ErrorFilter` global. É aceito como acoplamento de código sem estado; mover esse kit para uma pasta comum será considerado (por ADR) quando um terceiro contexto o usar.

**Alternativas**: consulta direta a `users` (rejeitada: acopla contextos); duplicar status de usuário no catálogo (rejeitada: dado desatualizado); copiar o kit HTTP (rejeitada: convenções de erro divergiriam).

## R2. Isolamento e integridade entre tenants

**Decisão**: as quatro tabelas têm `tenant_id`, `ENABLE`/`FORCE ROW LEVEL SECURITY` e a política padrão `tenantPolicy` da 002. Além da RLS, as chaves estrangeiras são **compostas**:

- `services (tenant_id, category_id)` → `service_categories (tenant_id, id)`;
- `service_executors (tenant_id, service_id)` → `services (tenant_id, id)`;
- `service_executors (tenant_id, user_id)` → `users (tenant_id, id)`.

Cada tabela referenciada ganha um índice único `(tenant_id, id)` (em `users`, via `0004_catalog.sql`). `app_runtime` recebe só os privilégios mínimos (R8).

**Racional**: a RLS filtra linhas, mas não impede uma linha que aponte para outro tenant. A chave composta fecha esse caminho no banco, no espírito do princípio I.

**Alternativas**: chaves simples com validação na aplicação (rejeitada: um bug passaria sem erro); gatilhos de verificação (rejeitada: mais código para o mesmo efeito).

## R3. Unicidade do nome

**Decisão**: a aplicação calcula `name_key = normalizeName(name)` (função pura do domínio: `trim`, normalização Unicode NFC, `toLocaleLowerCase('pt-BR')`) e o banco impõe `UNIQUE (tenant_id, name_key)` em serviços e em categorias. Violação (`23505`) vira `409 SERVICE_NAME_TAKEN` ou `409 CATEGORY_NAME_TAKEN`, o que também resolve cadastros simultâneos (spec, caso de borda). O índice **não filtra por status**: o nome de um serviço desativado continua reservado (FR-004); para reaproveitar o nome o dono renomeia o desativado.

**Racional**: comparação determinística e testável no domínio, independente do locale do banco (o `lower()` do Postgres muda com o `LC_CTYPE`, e a CI pode divergir do ambiente local).

**Alternativas**: índice por expressão `lower(btrim(name))` (rejeitada: depende do locale do cluster); extensão `citext` (rejeitada: dependência extra, mesmo problema de locale).

## R4. Dinheiro e duração

**Decisão**: `price_cents` e `duration_minutes` são `integer` com `CHECK`: preço entre 0 e 1.000.000; duração entre 5 e 480 e `duration_minutes % 5 = 0`. Os mesmos limites estão em `packages/domain` (`validatePrice`, `validateDuration`) e nos schemas Zod. Nome: 1 a 80 caracteres após `trim`; descrição: até 500, vazia vira nula. Valores específicos por executor usam as mesmas regras e são nulos quando não definidos.

**Racional**: constitution II (centavos inteiros). A regra existe nas três camadas: contrato (mensagem clara), domínio (testável) e banco (última barreira).

**Alternativas**: `numeric(12,2)` (rejeitada: proibido pela constitution II); só validar no contrato (rejeitada: escrita por outro caminho passaria).

## R5. Elegibilidade e vida dos vínculos

**Decisão**: vincular exige usuário `active` da mesma barbearia com papel `owner` ou `barber` (via `UserDirectory`, dentro da mesma transação). Desativar ou anonimizar o usuário **não** apaga vínculos; as consultas de executores e de `terms` filtram por `status = active` ao ler. Reativar o usuário devolve seus vínculos e valores. Um serviço ativo sem executor ativo é sinalizado com `executorCount = 0` ao dono (US3).

**Racional**: a spec pede que o histórico e os valores sobrevivam à desativação. O filtro na leitura evita ter que ouvir eventos da Identidade.

**Alternativas**: remover vínculos ao desativar (rejeitada: perde valores específicos); evento de domínio entre módulos (rejeitada: complexidade sem ganho, princípio X).

## R6. Trilha de auditoria

**Decisão**: tabela própria `catalog_events` (append-only: só `SELECT` e `INSERT` para `app_runtime`, mais gatilho `catalog_events_immutable` contra `UPDATE`, `DELETE` e `TRUNCATE`, copiando o desenho de `security_events`). Colunas: `tenant_id`, `type`, `actor_user_id`, `service_id` e `category_id` opcionais, `target_user_id` opcional, `details` (jsonb) e `created_at`. Tipos: `category_created`, `category_renamed`, `categories_reordered`, `category_deleted`, `service_created`, `service_updated`, `service_deactivated`, `service_reactivated`, `executor_linked`, `executor_updated`, `executor_unlinked`. `details` guarda nomes dos campos alterados e, para preço e duração, valores anterior e novo; é proibido guardar nome ou e-mail de pessoa (mesma verificação de chaves proibidas do `AuditService`). O evento é gravado na mesma transação da operação.

**Racional**: FR-014 e princípio IX. Tabela própria mantém a fronteira entre contextos (R1) e a política de leitura simples (dono vê eventos do próprio tenant).

**Alternativas**: reusar `security_events` (rejeitada: acopla o enum e os testes da Identidade); log de aplicação (rejeitada: não é imutável nem consultável).

## R7. Ordem das categorias

**Decisão**: coluna `position integer` sem unicidade. Nova categoria entra com `max(position) + 1` da barbearia, dentro da transação. `PUT /service-categories/order` recebe a lista completa de ids na nova ordem; se não for exatamente o conjunto atual da barbearia, responde `400 INVALID_ORDER`; senão regrava `position = índice` numa transação. A leitura ordena por `position, created_at`.

**Racional**: poucas categorias por barbearia; reordenar é raro. Sem unicidade, duas criações simultâneas não falham; o desempate por `created_at` mantém a lista estável.

**Alternativas**: posição fracionária ou lista encadeada (rejeitadas: complexidade desnecessária); unicidade deferrable (rejeitada: erro para o usuário numa corrida inofensiva).

## R8. Exclusão, desativação e permissões do banco

**Decisão**: `app_runtime` recebe: em `services`, `SELECT, INSERT, UPDATE` (**sem `DELETE`**); em `service_categories` e `service_executors`, `SELECT, INSERT, UPDATE, DELETE`; em `catalog_events`, `SELECT, INSERT`. Categoria só é removida se não tiver serviço (a chave estrangeira usa `ON DELETE RESTRICT` e o serviço checa antes para devolver `409 CATEGORY_NOT_EMPTY` com mensagem clara). Desativar é `status = 'deactivated'`, sem apagar vínculos nem valores.

**Racional**: FR-005 vira garantia estrutural: nem um bug da aplicação apaga um serviço. Vínculos e categorias vazias não têm histórico a preservar.

**Alternativas**: `deleted_at` (rejeitada: a spec proíbe apagar, e "excluir" ≠ "desativar"); gatilho contra `DELETE` (rejeitada: privilégio ausente já basta e é mais simples).

## R9. Listagem e visão do barbeiro

**Decisão**: `GET /services` devolve em uma consulta todos os serviços permitidos ao chamador, sem paginação (centenas no máximo). Dono: ativos e desativados (filtro `status`), com `executorCount`. Barbeiro: só ativos. Cada item traz o padrão (`priceCents`, `durationMinutes`), `mine` (o chamador é executor) e `effective` (preço e duração que valem **para o chamador**: os específicos se `mine` e definidos, senão o padrão). O agrupamento por categoria é feito pelo cliente com `GET /service-categories` (ordenado).

**Racional**: SC-006 e a decisão do clarify de que o barbeiro vê o catálogo inteiro com os seus marcados. `effective` evita que o cliente refaça a regra de precedência.

**Alternativas**: paginação por cursor (rejeitada: desnecessária nesta escala); devolver já agrupado (rejeitada: duplica a ordem e engessa o contrato).

## R10. Regras puras em `packages/domain`

**Decisão**: pasta `packages/domain/src/catalog` com:

- `normalizeName(text)` → chave de comparação (R3);
- `validateDuration(minutes)`, `validatePrice(cents)`, `validateServiceName`, `validateDescription`, `validateCategoryName` → resultado tipado, sem exceção, com o motivo;
- `resolveTerms(service, link)` → `{ priceCents, durationMinutes, priceSource, durationSource }`, em que cada campo usa o valor específico se não nulo e, senão, o padrão; preço e duração são resolvidos de forma independente.

Sem relógio, sem banco, sem framework. Testes escritos antes (Red → Green → Refactor).

**Racional**: princípio IV. `resolveTerms` é a regra que a agenda e a comanda vão reutilizar; precisa estar no domínio.

## R11. Contratos

**Decisão**: schemas Zod em `packages/contracts/src/catalog/` e registro de rotas `CATALOG_ROUTES`. O registro atual de `identity/routes.ts` passa a se chamar `IDENTITY_ROUTES`, e um novo `packages/contracts/src/routes.ts` exporta `ROUTES = [...IDENTITY_ROUTES, ...CATALOG_ROUTES]`, de modo que o OpenAPI continua gerado de um registro único e os importadores atuais seguem usando `ROUTES`. `HttpMethod` passa de `"get" | "post"` para incluir `"put" | "patch" | "delete"`; o `routes.spec.ts` e o gerador de OpenAPI são ajustados. Acesso: `session` para leitura e `owner` para escrita. Erros novos: `SERVICE_NAME_TAKEN`, `CATEGORY_NAME_TAKEN`, `CATEGORY_NOT_EMPTY`, `INVALID_ORDER`, `EXECUTOR_NOT_ELIGIBLE`; reaproveitados: `INVALID_DATA`, `NOT_FOUND`, `NO_PERMISSION`, `INVALID_SESSION`. Identificador de outra barbearia responde `404 NOT_FOUND`, como na 002.

## R12. Telas

**Decisão**: admin ganha `/catalog` (somente dono): lista agrupada por categoria, formulário de serviço, alternância ativar/desativar, painel de executores com campos opcionais de preço e duração, gestão de categorias (criar, renomear, reordenar com botões subir/descer, remover). O app do barbeiro ganha uma tela somente leitura com os serviços agrupados, destacando os seus e mostrando os valores `effective`. Textos em português; nenhum teste de interface, só tipos e lint (como na 002). Reordenar por botões, não por arrastar, para funcionar bem no celular.

**Alternativas**: arrastar e soltar (rejeitada: frágil no celular e exige biblioteca).

## R13. Testes

**Decisão**:

- **Domínio** (unitário, sem banco): todos os limites e arredondamentos de R4, `normalizeName` (maiúsculas, acentos, espaços), `resolveTerms` (específico só preço, só duração, ambos, nenhum).
- **Contratos** (unitário): cada schema aceita e recusa o esperado; `routes.spec.ts` confere que toda rota dos controladores está no registro com o mesmo acesso.
- **Integração**: `catalog-rls.spec.ts` (RLS e `FORCE` nas quatro tabelas, falha fechada, chave composta recusa linha cruzada, `DELETE` em `services` negado, `catalog_events` imutável); `catalog-leak.spec.ts` (todo endpoint com dados da outra barbearia responde 404 ou lista vazia); fluxos por história; auditoria completa sem dado pessoal; SC-005 (ciclo desativar/reativar idêntico); SC-006 (100 serviços); concorrência de nomes iguais (um vence).
- **Contrato por endpoint**: um arquivo por endpoint em `test/integration/contract/`.

## R14. Dependências

**Decisão**: nenhuma dependência nova. Nenhuma biblioteca de drag-and-drop, de dinheiro, de CSV ou de UI. Versões já travadas no `pnpm-lock.yaml`.
