# Data Model: Barbearia, usuários e autenticação

Todas as tabelas guardam datas em `timestamptz` (UTC) e usam `uuid` como chave (`gen_random_uuid()`). Nomes em português, como o resto do domínio. Decisões em [research.md](research.md).

**Regra transversal de RLS (R2)**: toda tabela abaixo tem `ENABLE` e `FORCE ROW LEVEL SECURITY` e uma política `tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid` em `USING` e `WITH CHECK`. Exceções estão indicadas na tabela.

## barbearia

O tenant. É a fronteira de isolamento.

| Campo | Tipo | Regras |
|---|---|---|
| `id` | uuid, PK | É o `tenant_id` das demais tabelas; a política da própria tabela usa `id` |
| `nome` | texto | Obrigatório, 1 a 120 caracteres, aparado. Não precisa ser único (spec, casos de borda) |
| `criada_em` | timestamptz | Padrão `now()` |

## unidade

Local de atendimento. Toda barbearia tem ao menos uma (FR-002).

| Campo | Tipo | Regras |
|---|---|---|
| `id` | uuid, PK | |
| `tenant_id` | uuid, FK → `barbearia.id` | RLS |
| `nome` | texto | Obrigatório, 1 a 120 caracteres |
| `fuso_horario` | texto | Nome IANA válido (`America/Sao_Paulo`); validado na criação (FR-003) |
| `criada_em` | timestamptz | |

A "ao menos uma unidade" é garantida pela operação de provisionamento, que cria barbearia, unidade e dono numa única transação (nenhuma gestão de unidades existe nesta feature).

## usuario

| Campo | Tipo | Regras |
|---|---|---|
| `id` | uuid, PK | |
| `tenant_id` | uuid, FK → `barbearia.id` | RLS |
| `nome` | texto | Obrigatório, 1 a 120 caracteres |
| `email` | texto | Normalizado (aparado, minúsculas), `CHECK (email = lower(email))`, **índice único global** (FR-006, FR-023) |
| `papel` | enum `dono` \| `barbeiro` | Definido no convite e **imutável** (FR-005) |
| `situacao` | enum `convidado` \| `ativo` \| `desativado` \| `anonimizado` | Ver transições abaixo |
| `senha_hash` | texto, nulo | Argon2id (PHC). Nulo enquanto `convidado` e após anonimização |
| `tentativas_falhas` | inteiro | Padrão 0; zera no login com sucesso (FR-015) |
| `bloqueado_ate` | timestamptz, nulo | Preenchido após 5 falhas seguidas |
| `criado_em` | timestamptz | |
| `desativado_em` | timestamptz, nulo | |
| `anonimizado_em` | timestamptz, nulo | |

**Restrições**: `CHECK` de que `situacao = 'ativo'` exige `senha_hash` não nulo; que `anonimizado` exige `senha_hash` nulo e `anonimizado_em` preenchido.

**Regra de último dono (FR-005)**: um gatilho recusa a mudança para `desativado` ou `anonimizado` do último usuário com `papel = 'dono'` e `situacao = 'ativo'` de um tenant. A regra também existe como função pura no domínio para mensagens de erro claras; o gatilho é a garantia final contra corridas.

### Transições de `situacao`

```text
              convite aceito                desativar
 convidado ───────────────────► ativo ─────────────────► desativado
     │  ▲                         ▲                          │  │
     │  └──── reativar (sem ──────┼───── reativar ──────────┘  │ anonimizar
     │        senha definida)     └────────────────────────────┤
     │ desativar                                               ▼
     └────────────────────────────────────────────────► anonimizado (final)
```

- `convidado → ativo`: o usuário aceita o convite e define a senha (FR-009).
- `ativo → desativado`: revoga todas as sessões (FR-008).
- `desativado → ativo`: reativar com senha já definida mantém as credenciais (US4, cenário 5). Se nunca definiu senha, volta a `convidado` e um novo convite é emitido.
- `convidado → desativado`: cancela o convite pendente.
- `desativado → anonimizado`: só pelo comando da equipe do produto (FR-024); estado final.
- `anonimizado` não volta.

## token_acesso

Convite (primeiro acesso) e recuperação de senha (R6).

| Campo | Tipo | Regras |
|---|---|---|
| `id` | uuid, PK | |
| `tenant_id` | uuid, FK | RLS |
| `usuario_id` | uuid, FK → `usuario.id` | |
| `finalidade` | enum `convite` \| `recuperacao` | |
| `token_hash` | bytea | SHA-256 do token; **único**. O token em claro nunca é guardado |
| `expira_em` | timestamptz | 7 dias após a criação (convite) ou 1 hora (recuperação) |
| `usado_em` | timestamptz, nulo | Uso único |
| `invalidado_em` | timestamptz, nulo | Preenchido quando um novo token da mesma finalidade substitui este |
| `criado_em` | timestamptz | |

Um token é **válido** quando `usado_em` e `invalidado_em` são nulos e `expira_em` está no futuro (regra pura no domínio).

## sessao

| Campo | Tipo | Regras |
|---|---|---|
| `id` | uuid, PK | |
| `tenant_id` | uuid, FK | RLS |
| `usuario_id` | uuid, FK → `usuario.id` | |
| `token_hash` | bytea | SHA-256 do token de sessão; **único** |
| `criada_em` | timestamptz | |
| `ultimo_uso_em` | timestamptz | Renovado no máximo a cada 1 minuto |
| `expira_em` | timestamptz | `ultimo_uso_em` + 12 horas (dono) ou 30 dias (barbeiro) (FR-013) |
| `revogada_em` | timestamptz, nulo | Sair, desativar ou trocar a senha |

Uma sessão é **válida** quando `revogada_em` é nulo, `expira_em` está no futuro e o usuário está `ativo`. Sessões expiradas ou revogadas há mais de 30 dias podem ser removidas por rotina futura (fora do escopo).

## evento_seguranca

Trilha de auditoria imutável (FR-020, SC-006).

| Campo | Tipo | Regras |
|---|---|---|
| `id` | uuid, PK | |
| `tenant_id` | uuid, nulo, FK | Nulo apenas para falhas de login de e-mail inexistente. **Política**: `INSERT` aceita `tenant_id IS NULL` ou igual ao contexto; `SELECT` só vê o próprio tenant, então eventos sem tenant não aparecem a nenhuma barbearia |
| `tipo` | enum | `barbearia_provisionada`, `convite_enviado`, `convite_aceito`, `login_sucesso`, `login_falha`, `logout`, `senha_recuperacao_solicitada`, `senha_redefinida`, `usuario_desativado`, `usuario_reativado`, `usuario_anonimizado` |
| `ator_tipo` | enum `usuario` \| `plataforma` \| `sistema` | `plataforma` = comandos da equipe do produto |
| `ator_usuario_id` | uuid, nulo | Quem executou, quando `ator_tipo = usuario` |
| `alvo_usuario_id` | uuid, nulo | Em quem a ação recaiu |
| `detalhe` | jsonb | Somente dados não pessoais (por exemplo, papel do convite). **Nunca** e-mail, nome, senha, token ou IP |
| `ocorrido_em` | timestamptz | Padrão `now()` |

**Imutabilidade**: `app_runtime` tem somente `INSERT` e `SELECT`; um gatilho `BEFORE UPDATE OR DELETE` levanta erro para qualquer papel. Sobrevive à anonimização porque só referencia o usuário por `id` (FR-024, SC-008).

## Relacionamentos

```text
barbearia 1───* unidade
barbearia 1───* usuario 1───* sessao
                  usuario 1───* token_acesso
barbearia 1───* evento_seguranca  (tenant_id pode ser nulo)
```

## Funções de banco (R3)

Funções `SECURITY DEFINER`, com `search_path` fixo e `EXECUTE` só para `app_runtime`. Detalhe de colunas devolvidas em [contracts/api.md](contracts/api.md#apoio-de-banco).

| Função | Entrada | Devolve |
|---|---|---|
| `auth_buscar_usuario_por_email` | e-mail normalizado | `id`, `tenant_id`, `papel`, `situacao`, `senha_hash`, `tentativas_falhas`, `bloqueado_ate` |
| `auth_buscar_sessao` | hash do token | dados da sessão + `papel`, `situacao` do usuário |
| `auth_buscar_token_acesso` | hash do token, finalidade | `id`, `tenant_id`, `usuario_id`, `expira_em`, `usado_em`, `invalidado_em` |

## Dados pessoais (princípio IX)

Pessoais: `usuario.nome` e `usuario.email`. Nome da barbearia e da unidade são dados da empresa. Nenhuma outra tabela, log ou evento guarda esses valores (FR-021). A anonimização atua apenas em `usuario` (e revoga `sessao` e `token_acesso`).
