# Data Model: Identidade visual da barbearia e painel do dono

Datas em `timestamptz` (UTC) e chaves `uuid` (`gen_random_uuid()`), como nas features anteriores. Nomes de tabelas e colunas em inglês. Decisões em [research.md](research.md). Migration nova: `0005_branding.sql`.

**Regra transversal de RLS**: `barbershop_branding`, `barbershop_logos` e `branding_events` têm `ENABLE` e `FORCE ROW LEVEL SECURITY` e a política padrão `tenantPolicy` (`tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid` em `USING` e `WITH CHECK`). Sem contexto de tenant, `app_runtime` não lê nem escreve nenhuma linha. A única leitura sem tenant é a das funções públicas abaixo, feitas pelo papel `app_public` (R3).

## Alteração em tabela existente: `barbershops`

| Campo | Tipo | Regras |
|---|---|---|
| `public_slug` (novo) | texto | `NOT NULL`, **único**, 3 a 40 caracteres, `CHECK (public_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')` |

O esquema do Drizzle declara a coluna `.notNull()` (para o `db:generate` não detectar divergência) e a migration, reordenada à mão, adiciona a coluna anulável, preenche as barbearias existentes (slug do nome, com sufixo numérico em colisão) e só então aplica `NOT NULL` e a unicidade. O provisionamento passa a gravar o slug. Nenhuma outra coluna nem dado muda. O `name` continua com `CHECK` de 1 a 120 caracteres; a regra de 1 a 80 desta feature vale ao **alterar** o nome (contrato e domínio). `app_runtime` ganha `UPDATE (name)` na tabela, por coluna.

## barbershop_branding

Uma linha por barbearia (criada na primeira personalização; a ausência de linha significa "aparência padrão").

| Campo | Tipo | Regras |
|---|---|---|
| `tenant_id` | uuid, PK, FK → `barbershops.id` | RLS |
| `theme` | enum `branding_theme` (`noir`, `day`, `leather`) | Obrigatório; padrão `noir` |
| `primary_tone` | enum `branding_tone` (10 valores) | Obrigatório; padrão `gold` |
| `accent_tone` | enum `branding_tone` | Obrigatório; padrão `gold`; pode ser igual à principal |
| `logo_version` | texto, nulo | Hash do logo atual; nulo = sem logo |
| `updated_at` | timestamptz | Atualizado a cada alteração |

`branding_tone`: `gold`, `terracotta`, `sage`, `blue`, `violet`, `rose`, `teal`, `orange`, `wine`, `graphite`. Os enums do banco recusam valor fora da lista (FR-004); o contrato Zod recusa antes (R11). Tema ou tom que deixe de existir numa revisão futura cai no padrão em tempo de leitura (caso de borda da spec), nunca em erro.

## barbershop_logos

Uma linha por barbearia, **separada** de `barbershop_branding` para que a leitura da identidade nunca traga os bytes (R4).

| Campo | Tipo | Regras |
|---|---|---|
| `tenant_id` | uuid, PK, FK → `barbershops.id` | RLS |
| `content` | bytea | Obrigatório; `CHECK (octet_length(content) between 1 and 524288)` (512 KB) |
| `content_type` | enum `logo_type` (`image/png`, `image/jpeg`, `image/webp`) | Tipo **detectado** pelos bytes (R5) |
| `width`, `height` | inteiro | `CHECK (least(width,height) >= 64 and greatest(width,height) <= 2000)` |
| `version` | texto | Hash SHA-256 (hex, 16 primeiros caracteres) do conteúdo; igual a `barbershop_branding.logo_version` |
| `updated_at` | timestamptz | |

Remover o logo apaga a linha e zera `logo_version`. Trocar substitui a linha. Os limites existem no domínio (`validateLogo`), no contrato (cabeçalho e tamanho) e no banco (`CHECK`).

## branding_events

Trilha imutável (FR-014), no desenho de `catalog_events`.

| Campo | Tipo | Regras |
|---|---|---|
| `id` | uuid, PK | |
| `tenant_id` | uuid, FK → `barbershops.id` | RLS |
| `type` | enum `branding_event_type` | `branding_updated`, `logo_changed`, `logo_removed`, `branding_reset` |
| `actor_user_id` | uuid | Sem FK, para sobreviver à anonimização |
| `details` | jsonb | Só nomes de campos e valores fechados (tema, tons); nunca o nome, o logo nem dados pessoais |
| `occurred_at` | timestamptz | |

`app_runtime` tem só `SELECT` e `INSERT`; um gatilho `branding_events_immutable` impede `UPDATE`, `DELETE` e `TRUNCATE`. Índice `(tenant_id, occurred_at)`.

## Papel e funções públicas (R3)

**Papel `app_public`**: `NOLOGIN`, sem `BYPASSRLS`, `SELECT` apenas em `barbershops (id, name, public_slug)`, `barbershop_branding` e `barbershop_logos`, cada tabela com uma política `*_public_read` `FOR SELECT TO app_public USING (true)`. Mesmo desenho do papel `app_auth` da 002.

| Função | Entrada | Devolve (campos mínimos) |
|---|---|---|
| `public_get_identity(p_slug text)` | slug do link | `name`, `theme`, `primary_tone`, `accent_tone`, `logo_version`, `updated_at`; **zero linhas** se o slug não existe |
| `public_get_logo(p_slug text)` | slug do link | `content`, `content_type`, `version`; **zero linhas** se não há logo |

Ambas: `LANGUAGE sql STABLE SECURITY DEFINER`, `SET search_path = pg_catalog, public`, dono `app_public`, `REVOKE ALL ... FROM PUBLIC`, `GRANT EXECUTE` só a `app_runtime` (e ao papel das migrations, como nas funções `auth_*`). Nenhuma devolve `tenant_id`, e-mail, equipe, serviços, preços nem eventos.

## Permissões de `app_runtime`

| Tabela | Privilégios |
|---|---|
| `barbershops` | `SELECT` (já tinha) e `UPDATE (name)` |
| `barbershop_branding` | `SELECT`, `INSERT`, `UPDATE` (sem `DELETE`: restaurar o padrão regrava os valores padrão) |
| `barbershop_logos` | `SELECT`, `INSERT`, `UPDATE`, `DELETE` (remover o logo apaga os bytes) |
| `branding_events` | `SELECT`, `INSERT` |

## Regras e transições

- **Escrever identidade** (`PUT /branding`): só o dono; valida nome (1 a 80 após aparar), tema e tons; grava `barbershop_branding` e, se o nome mudou, `barbershops.name` via `BarbershopDirectory.rename`; evento `branding_updated` na mesma transação. Vale a última escrita; os dois eventos ficam.
- **Logo** (`PUT /branding/logo`): valida pelos bytes; grava `barbershop_logos`, atualiza `logo_version`, evento `logo_changed`. Rejeição não altera nada.
- **Remover logo** (`DELETE /branding/logo`): apaga a linha, `logo_version` nulo, evento `logo_removed`.
- **Restaurar padrão** (`POST /branding/reset`): tema `noir`, tons `gold` e `gold`; **não** altera o nome (FR-013) nem o logo; evento `branding_reset`. O logo se remove à parte (US5).
- **Leitura**: sem linha em `barbershop_branding` = padrão do produto (Noir, Ouro e Ouro, sem logo) com o nome já cadastrado (FR-010).
- **Usuário desativado**: perde o acesso (sessão revogada pela 002) e portanto deixa de ver a identidade autenticada (caso de borda); a leitura pública continua aberta por ser pública.
