# Data Model: Barbearia, usuários e autenticação

Todas as tabelas guardam datas em `timestamptz` (UTC) e usam `uuid` como chave (`gen_random_uuid()`). Nomes em português, como o resto do domínio. Decisões em [research.md](research.md).

**Regra transversal de RLS (R2)**: toda tabela abaixo tem `ENABLE` e `FORCE ROW LEVEL SECURITY` e uma política `tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid` em `USING` e `WITH CHECK`. Exceções estão indicadas na tabela.

## barbershops

O tenant. É a fronteira de isolamento.

| Campo | Tipo | Regras |
|---|---|---|
| `id` | uuid, PK | É o `tenant_id` das demais tabelas; a política da própria tabela usa `id` |
| `name` | texto | Obrigatório, 1 a 120 caracteres, aparado. Não precisa ser único (spec, casos de borda) |
| `created_at` | timestamptz | Padrão `now()` |

## units

Local de atendimento. Toda barbearia tem ao menos uma (FR-002).

| Campo | Tipo | Regras |
|---|---|---|
| `id` | uuid, PK | |
| `tenant_id` | uuid, FK → `barbershop.id` | RLS |
| `name` | texto | Obrigatório, 1 a 120 caracteres |
| `timezone` | texto | Nome IANA válido (`America/Sao_Paulo`); validado na criação (FR-003) |
| `created_at` | timestamptz | |

A "ao menos uma unidade" é garantida pela operação de provisionamento, que cria barbearia, unidade e dono numa única transação (nenhuma gestão de unidades existe nesta feature).

## users

| Campo | Tipo | Regras |
|---|---|---|
| `id` | uuid, PK | |
| `tenant_id` | uuid, FK → `barbershop.id` | RLS |
| `name` | texto | Obrigatório, 1 a 120 caracteres |
| `email` | texto | Normalizado (aparado, minúsculas), `CHECK (email = lower(email))`, **índice único global** (FR-006, FR-023) |
| `role` | enum `owner` \| `barber` | Definido no convite e **imutável** (FR-005) |
| `status` | enum `invited` \| `active` \| `deactivated` \| `anonymized` | Ver transições abaixo |
| `password_hash` | texto, nulo | Argon2id (PHC). Nulo enquanto `invited` e após anonimização |
| `failed_attempts` | inteiro | Padrão 0; zera no login com sucesso (FR-015) |
| `locked_until` | timestamptz, nulo | Preenchido após 5 falhas seguidas |
| `created_at` | timestamptz | |
| `deactivated_at` | timestamptz, nulo | |
| `anonymized_at` | timestamptz, nulo | |

**Restrições**: `CHECK` de que `status = 'active'` exige `password_hash` não nulo; que `anonymized` exige `password_hash` nulo e `anonymized_at` preenchido.

**Regra de último dono (FR-005)**: um gatilho recusa a mudança para `deactivated` ou `anonymized` do último usuário com `role = 'owner'` e `status = 'active'` de um tenant. A regra também existe como função pura no domínio para mensagens de erro claras; o gatilho é a garantia final contra corridas.

### Transições de `status`

```text
              convite aceito                 desativar
 invited ───────────────────► active ─────────────────► deactivated
     │  ▲                         ▲                          │  │
     │  └──── reativar (sem ────────┼───── reativar ──────────┘  │ anonimizar
     │        senha definida)       └────────────────────────────┤
     │ desativar                                                 ▼
     └────────────────────────────────────────────────► anonymized (final)
```

- `invited → active`: o usuário aceita o convite e define a senha (FR-009).
- `active → deactivated`: revoga todas as sessões (FR-008).
- `deactivated → active`: reativar com senha já definida mantém as credenciais (US4, cenário 5). Se nunca definiu senha, volta a `invited` e um novo convite é emitido.
- `invited → deactivated`: cancela o convite pendente.
- `deactivated → anonymized`: só pelo comando da equipe do produto (FR-024); estado final.
- `anonymized` não volta.

## access_tokens

Convite (primeiro acesso) e recuperação de senha (R6). Corresponde às entidades **Convite** (`purpose = invitation`) e **Credencial de recuperação** (`purpose = recovery`) da spec.

| Campo | Tipo | Regras |
|---|---|---|
| `id` | uuid, PK | |
| `tenant_id` | uuid, FK | RLS |
| `user_id` | uuid, FK → `user.id` | |
| `purpose` | enum `invitation` \| `recovery` | |
| `token_hash` | bytea | SHA-256 do token; **único**. O token em claro nunca é guardado |
| `expires_at` | timestamptz | 7 dias após a criação (convite) ou 1 hora (recuperação) |
| `used_at` | timestamptz, nulo | Uso único |
| `invalidated_at` | timestamptz, nulo | Preenchido quando um novo token da mesma finalidade substitui este |
| `created_at` | timestamptz | |

Um token é **válido** quando `used_at` e `invalidated_at` são nulos e `expires_at` está no futuro (regra pura no domínio).

## sessions

| Campo | Tipo | Regras |
|---|---|---|
| `id` | uuid, PK | |
| `tenant_id` | uuid, FK | RLS |
| `user_id` | uuid, FK → `user.id` | |
| `token_hash` | bytea | SHA-256 do token de sessão; **único** |
| `created_at` | timestamptz | |
| `last_used_at` | timestamptz | Renovado no máximo a cada 1 minuto |
| `expires_at` | timestamptz | `last_used_at` + 12 horas (dono) ou 30 dias (barbeiro) (FR-013) |
| `revoked_at` | timestamptz, nulo | Sair, desativar ou trocar a senha |

Uma sessão é **válida** quando `revoked_at` é nulo, `expires_at` está no futuro e o usuário está `active`. Sessões expiradas ou revogadas há mais de 30 dias podem ser removidas por rotina futura (fora do escopo).

## security_events

Trilha de auditoria imutável (FR-020, SC-006).

| Campo | Tipo | Regras |
|---|---|---|
| `id` | uuid, PK | |
| `tenant_id` | uuid, nulo, FK | Nulo apenas para falhas de login de e-mail inexistente. **Política**: `INSERT` aceita `tenant_id IS NULL` ou igual ao contexto; `SELECT` só vê o próprio tenant, então eventos sem tenant não aparecem a nenhuma barbearia |
| `type` | enum | `barbershop_provisioned`, `invitation_sent`, `invitation_accepted`, `login_success`, `login_failure`, `logout`, `password_recovery_requested`, `password_reset`, `user_deactivated`, `user_reactivated`, `user_anonymized` |
| `actor_type` | enum `user` \| `platform` \| `system` | `platform` = comandos da equipe do produto |
| `actor_user_id` | uuid, nulo | Quem executou, quando `actor_type = user` |
| `target_user_id` | uuid, nulo | Em quem a ação recaiu |
| `details` | jsonb | Somente dados não pessoais (por exemplo, papel do convite). **Nunca** e-mail, nome, senha, token ou IP |
| `occurred_at` | timestamptz | Padrão `now()` |

**Imutabilidade**: `app_runtime` tem somente `INSERT` e `SELECT`; um gatilho `BEFORE UPDATE OR DELETE` levanta erro para qualquer papel. Sobrevive à anonimização porque só referencia o usuário por `id` (FR-024, SC-008).

## Relacionamentos

```text
barbershop 1───* unit
barbershop 1───* user 1───* session
                  user 1───* access_tokens
barbershop 1───* security_events  (tenant_id pode ser nulo)
```

## Funções de banco (R3)

Funções `SECURITY DEFINER`, com `search_path` fixo e `EXECUTE` só para `app_runtime`. Detalhe de colunas devolvidas em [contracts/api.md](contracts/api.md#apoio-de-banco).

| Função | Entrada | Devolve |
|---|---|---|
| `auth_find_user_by_email` | e-mail normalizado | `id`, `tenant_id`, `role`, `status`, `password_hash`, `failed_attempts`, `locked_until` |
| `auth_find_session` | hash do token | dados da sessão + `role`, `status` do usuário |
| `auth_find_access_token` | hash do token, finalidade | `id`, `tenant_id`, `user_id`, `expires_at`, `used_at`, `invalidated_at` |

## Dados pessoais (princípio IX)

Pessoais: `user.name` e `user.email`. Nome da barbearia e da unidade são dados da empresa. Nenhuma outra tabela, log ou evento guarda esses valores (FR-021). A anonimização atua apenas em `user` (e revoga `session` e `access_tokens`).
