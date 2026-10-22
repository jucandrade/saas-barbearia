# Data Model: Catálogo de serviços

Datas em `timestamptz` (UTC) e chaves `uuid` (`gen_random_uuid()`), como na 002. Nomes de tabelas e colunas em inglês. Decisões em [research.md](research.md).

**Regra transversal de RLS (R2)**: toda tabela abaixo tem `ENABLE` e `FORCE ROW LEVEL SECURITY` e a política `tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid` em `USING` e `WITH CHECK` (`tenantPolicy`). Sem contexto de tenant nenhuma linha é lida nem escrita.

**Alteração em tabela existente (migration `0004_catalog.sql`)**: `users` ganha o índice único `users_tenant_id_id_idx (tenant_id, id)`, necessário para a chave estrangeira composta. Nenhuma coluna nem dado muda.

## service_categories

| Campo | Tipo | Regras |
|---|---|---|
| `id` | uuid, PK | |
| `tenant_id` | uuid, FK → `barbershops.id` | RLS |
| `name` | texto | Obrigatório, 1 a 80 caracteres após `trim` |
| `name_key` | texto | `normalizeName(name)`; **único por barbearia** |
| `position` | inteiro | Ordem de exibição; sem unicidade (R7) |
| `created_at`, `updated_at` | timestamptz | |

Restrições: `UNIQUE (tenant_id, id)` (alvo da chave composta); `UNIQUE (tenant_id, name_key)`; `CHECK (char_length(name) between 1 and 80)`.

## services

| Campo | Tipo | Regras |
|---|---|---|
| `id` | uuid, PK | |
| `tenant_id` | uuid | RLS |
| `category_id` | uuid | Obrigatório; FK composta `(tenant_id, category_id)` → `service_categories (tenant_id, id)` com `ON DELETE RESTRICT` |
| `name` | texto | 1 a 80 caracteres após `trim` |
| `name_key` | texto | `normalizeName(name)`; **único por barbearia** |
| `description` | texto, nulo | Até 500 caracteres; vazio vira nulo |
| `duration_minutes` | inteiro | Entre 5 e 480 e múltiplo de 5 |
| `price_cents` | inteiro | Entre 0 e 1.000.000 |
| `status` | enum `active` \| `deactivated` | Padrão `active` |
| `created_at`, `updated_at` | timestamptz | |

Restrições: `UNIQUE (tenant_id, id)`; `UNIQUE (tenant_id, name_key)`; `CHECK` de tamanho do nome e da descrição; `CHECK (duration_minutes between 5 and 480 and duration_minutes % 5 = 0)`; `CHECK (price_cents between 0 and 1000000)`.

**Nunca apagado**: `app_runtime` não tem `DELETE` nesta tabela (R8).

### Transições de `status`

```text
active ──desativar──► deactivated
   ▲                       │
   └──────reativar─────────┘
```

Desativar e reativar não alteram nenhum outro dado nem vínculo (SC-005). Editar um serviço desativado é permitido.

## service_executors

Vínculo entre um serviço e um usuário executor, com valores específicos opcionais.

| Campo | Tipo | Regras |
|---|---|---|
| `tenant_id` | uuid | RLS |
| `service_id` | uuid | FK composta `(tenant_id, service_id)` → `services (tenant_id, id)` |
| `user_id` | uuid | FK composta `(tenant_id, user_id)` → `users (tenant_id, id)` |
| `price_cents` | inteiro, nulo | Se presente, entre 0 e 1.000.000; nulo = usa o padrão do serviço |
| `duration_minutes` | inteiro, nulo | Se presente, entre 5 e 480 e múltiplo de 5; nulo = usa o padrão |
| `created_at`, `updated_at` | timestamptz | |

Chave primária `(service_id, user_id)`. A elegibilidade do usuário (ativo, dono ou barbeiro) é verificada na aplicação via `UserDirectory` (R5); o banco garante apenas que o usuário é do mesmo tenant.

**Vida do vínculo**: sobrevive à desativação do usuário e do serviço. As leituras filtram usuários `active` (R5).

## catalog_events

Trilha imutável (R6).

| Campo | Tipo | Regras |
|---|---|---|
| `id` | uuid, PK | |
| `tenant_id` | uuid | RLS: leitura e escrita só no próprio tenant |
| `type` | enum | `category_created`, `category_renamed`, `categories_reordered`, `category_deleted`, `service_created`, `service_updated`, `service_deactivated`, `service_reactivated`, `executor_linked`, `executor_updated`, `executor_unlinked` |
| `actor_user_id` | uuid | Quem executou (sempre um dono) |
| `service_id`, `category_id`, `target_user_id` | uuid, nulos | Referências por identificador; **sem chave estrangeira**, para a trilha sobreviver a exclusões de categoria e vínculo |
| `details` | jsonb | Nomes de campos alterados e, para preço e duração, valores anterior e novo; **nunca** nome ou e-mail |
| `created_at` | timestamptz | |

Permissões: `app_runtime` só `SELECT` e `INSERT`. O gatilho `catalog_events_immutable` recusa `UPDATE`, `DELETE` e `TRUNCATE`.

## Permissões do `app_runtime` (resumo)

| Tabela | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `service_categories` | ✅ | ✅ | ✅ | ✅ (só categoria vazia, pela aplicação e pela FK) |
| `services` | ✅ | ✅ | ✅ | ❌ |
| `service_executors` | ✅ | ✅ | ✅ | ✅ |
| `catalog_events` | ✅ | ✅ | ❌ | ❌ |

## Valor aplicável a um executor (FR-010)

Para um serviço `S` e um executor `U`: `priceCents = vínculo.price_cents ?? S.price_cents` e `durationMinutes = vínculo.duration_minutes ?? S.duration_minutes`, avaliados de forma independente. Se não há vínculo com `U`, só vale o padrão e `U` não é executor. Implementado como `resolveTerms` no domínio.

## Relações

```text
barbershops 1 ── n service_categories 1 ── n services 1 ── n service_executors n ── 1 users
                                                │
                                                └── eventos em catalog_events (por id, sem FK)
```
