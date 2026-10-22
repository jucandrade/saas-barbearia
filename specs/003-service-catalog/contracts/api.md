# Contrato: API do catálogo de serviços

Contrato de referência dos endpoints desta feature. A fonte da verdade são os schemas Zod em `packages/contracts/src/catalog/`; o OpenAPI 3.1 é gerado deles (R11). Mensagens ao usuário em português. Convenções gerais (formato JSON, sessão por cookie ou `Bearer`, verificação de `Origin`, formato de erro, datas em ISO 8601 UTC) são as de [../../002-tenant-auth/contracts/api.md](../../002-tenant-auth/contracts/api.md).

## Convenções

- **Acesso**: `session` = qualquer usuário autenticado (dono ou barbeiro); `owner` = só dono. Sem sessão: `401 INVALID_SESSION`. Barbeiro em rota `owner`: `403 NO_PERMISSION`.
- **Tenant**: o `tenant_id` sai da sessão, nunca do corpo. Identificador de outra barbearia responde `404 NOT_FOUND`, igual a um inexistente.
- **Erro**: `{ "code": "STABLE_CODE", "message": "Texto para o usuário", "fields": { "name": "..." } }`. `fields` só aparece em `400 INVALID_DATA`.
- **Valores**: `priceCents` em centavos inteiros (0 a 1.000.000); `durationMinutes` inteiro múltiplo de 5 (5 a 480). Nome: 1 a 80 caracteres; descrição: até 500.
- **Novos códigos**: `SERVICE_NAME_TAKEN` (409), `CATEGORY_NAME_TAKEN` (409), `CATEGORY_NOT_EMPTY` (409), `INVALID_ORDER` (400), `EXECUTOR_NOT_ELIGIBLE` (409).
- **Atualização**: `PATCH` altera só os campos enviados; ao salvar vale a última escrita (sem controle otimista), e cada alteração gera um evento de auditoria na mesma transação.

## Tipos de resposta

```json
// ServiceCategory
{ "id": "uuid", "name": "string", "position": 0 }

// Service (item da lista e detalhe)
{
  "id": "uuid", "name": "string", "description": "string|null",
  "categoryId": "uuid",
  "priceCents": 4500, "durationMinutes": 30,
  "status": "active|deactivated",
  "mine": true,
  "effective": { "priceCents": 5000, "durationMinutes": 30 },
  "executorCount": 2
}
```

`priceCents` e `durationMinutes` são o **padrão** do serviço. `mine` indica que o chamador é executor do serviço. `effective` é o que vale **para o chamador** (os valores específicos dele quando `mine` e definidos; senão o padrão). `executorCount` é devolvido **só ao dono**, e conta executores ativos.

## Categorias

### `GET /service-categories` — session

`200`: `{ "categories": ServiceCategory[] }`, ordenadas por `position`, `createdAt`.

### `POST /service-categories` — owner

Entrada: `{ "name": string }`.

| Resultado | Corpo |
|---|---|
| `201` | `ServiceCategory` (entra no fim da ordem) |
| `409 CATEGORY_NAME_TAKEN` | "Já existe uma categoria com esse nome." |
| `400 INVALID_DATA` | Nome vazio ou longo demais |

Evento: `category_created`.

### `PATCH /service-categories/{id}` — owner

Entrada: `{ "name": string }`. `200` com `ServiceCategory`; `404`; `409 CATEGORY_NAME_TAKEN`; `400 INVALID_DATA`. Evento: `category_renamed`. Os serviços da categoria não mudam.

### `PUT /service-categories/order` — owner

Entrada: `{ "ids": uuid[] }` com **todas** as categorias da barbearia na nova ordem.

| Resultado | Corpo |
|---|---|
| `204` | Sem corpo |
| `400 INVALID_ORDER` | "A lista precisa conter exatamente as categorias da barbearia." (faltam, sobram ou repetem ids) |

Evento: `categories_reordered`.

### `DELETE /service-categories/{id}` — owner

| Resultado | Corpo |
|---|---|
| `204` | Categoria removida |
| `404` | Inexistente ou de outra barbearia |
| `409 CATEGORY_NOT_EMPTY` | "Mova ou desative os serviços desta categoria antes de removê-la." (conta serviços ativos **e** desativados) |

Evento: `category_deleted`.

## Serviços

### `GET /services?status=active|deactivated|all` — session

`200`: `{ "services": Service[] }`, sem paginação (R9). Dono: `status` padrão `all`. Barbeiro: sempre só `active` (outro valor de `status` é ignorado). Ordem: categoria (`position`), depois nome.

### `POST /services` — owner

Entrada: `{ "name": string, "description"?: string, "categoryId": uuid, "priceCents": int, "durationMinutes": int }`.

| Resultado | Corpo |
|---|---|
| `201` | `Service` (status `active`) |
| `400 INVALID_DATA` | Cada problema em `fields` (nome, duração fora do passo ou do intervalo, preço fora do intervalo, categoria inexistente) |
| `409 SERVICE_NAME_TAKEN` | "Já existe um serviço com esse nome." |

Evento: `service_created`.

### `GET /services/{id}` — session

`200 Service`. Barbeiro só vê serviço `active` (desativado responde `404`). Dono vê qualquer um.

### `PATCH /services/{id}` — owner

Entrada: qualquer subconjunto de `name`, `description` (`null` limpa), `categoryId`, `priceCents`, `durationMinutes`. `200 Service`; `404`; `400 INVALID_DATA`; `409 SERVICE_NAME_TAKEN`. Permitido também em serviço desativado. Não altera valores específicos nem vínculos. Evento: `service_updated` (com antes e depois de preço e duração).

### `POST /services/{id}/deactivate` e `POST /services/{id}/reactivate` — owner

`204` (idempotente: repetir não é erro e não gera novo evento); `404`. Não há `DELETE /services/{id}`: a rota não existe e o banco nega a operação. Eventos: `service_deactivated`, `service_reactivated`.

## Executores

### `GET /services/{id}/executors` — session

`200`: `{ "executors": [{ "userId": "uuid", "name": "string", "priceCents": int|null, "durationMinutes": int|null }] }`. Só usuários `active`. O barbeiro vê apenas `userId` e `name` dos colegas; os valores específicos são omitidos para quem não é o próprio executor nem dono. Nunca devolve e-mail. Barbeiro em serviço desativado: `404`.

### `PUT /services/{id}/executors/{userId}` — owner

Cria o vínculo ou atualiza os valores específicos. Entrada: `{ "priceCents"?: int|null, "durationMinutes"?: int|null }` (corpo vazio vincula sem valores específicos; `null` volta ao padrão).

| Resultado | Corpo |
|---|---|
| `200` | O vínculo `{ userId, name, priceCents, durationMinutes }` |
| `404` | Serviço ou usuário inexistente ou de outra barbearia |
| `409 EXECUTOR_NOT_ELIGIBLE` | "Só usuários ativos da barbearia podem executar serviços." (desativado, anonimizado, convite pendente) |
| `400 INVALID_DATA` | Valor específico fora do intervalo ou do passo |

Eventos: `executor_linked` (novo) ou `executor_updated` (valores alterados).

### `DELETE /services/{id}/executors/{userId}` — owner

`204` (idempotente); `404` se o serviço não existir. Evento: `executor_unlinked`.

## Valores aplicáveis

### `GET /services/{id}/terms?userId=uuid` — session

Resolve preço e duração de um serviço para um executor (FR-010). `200`: `{ "priceCents": int, "durationMinutes": int, "priceSource": "executor|service", "durationSource": "executor|service" }`. `404` se o serviço não existir, o usuário não for executor ativo dele ou o barbeiro consultar serviço desativado. Funciona para o dono mesmo com serviço desativado (uso do histórico). O mesmo cálculo é exposto internamente por `CatalogFacade.resolveTerms` para a agenda e a comanda.

## Resumo dos 15 endpoints

| # | Método e caminho | Acesso |
|---|---|---|
| 1 | `GET /service-categories` | session |
| 2 | `POST /service-categories` | owner |
| 3 | `PATCH /service-categories/{id}` | owner |
| 4 | `PUT /service-categories/order` | owner |
| 5 | `DELETE /service-categories/{id}` | owner |
| 6 | `GET /services` | session |
| 7 | `POST /services` | owner |
| 8 | `GET /services/{id}` | session |
| 9 | `PATCH /services/{id}` | owner |
| 10 | `POST /services/{id}/deactivate` | owner |
| 11 | `POST /services/{id}/reactivate` | owner |
| 12 | `GET /services/{id}/executors` | session |
| 13 | `PUT /services/{id}/executors/{userId}` | owner |
| 14 | `DELETE /services/{id}/executors/{userId}` | owner |
| 15 | `GET /services/{id}/terms` | session |
