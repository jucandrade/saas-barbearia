---

description: "Lista de tarefas da feature 002-tenant-auth"
---

# Tasks: Barbearia, usuários e autenticação

**Input**: documentos de design em `/specs/002-tenant-auth/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: incluídos, porque a constitution os exige: domínio em TDD estrito (princípio IV), testes de contrato por endpoint (princípio V) e testes de vazamento entre barbearias (princípio I). Em toda fase, os testes são escritos **antes** do código que exercitam e devem falhar primeiro.

**Organization**: tarefas agrupadas por user story. Os caminhos são relativos à raiz do repositório. Restrições de campo (tamanhos, nulos, enums) estão reproduzidas de [data-model.md](data-model.md) nas tarefas de esquema.

## Format: `[ID] [P?] [Story] Descrição`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência de tarefa incompleta)
- **[Story]**: user story a que a tarefa pertence (US1 a US5)


## Phase 1: Setup (dependências, infraestrutura e scripts)

**Purpose**: dependências novas, Mailpit e scripts que as demais fases usam.

- [X] T001 Adicionar em `apps/api/package.json` as dependências `drizzle-orm`, `pg`, `argon2`, `nodemailer`, `@nestjs/throttler`, `zod` e, em dev, `drizzle-kit`, `@types/pg`, `@types/nodemailer` (versões de [plan.md](plan.md#technical-context)); incluir `argon2` em `onlyBuiltDependencies` de `pnpm-workspace.yaml` se `pnpm approve-builds` pedir; rodar `pnpm install` e conferir que `pnpm lint` e `pnpm typecheck` seguem passando
- [X] T002 [P] Adicionar `zod` a `packages/contracts/package.json` e confirmar que o pacote compila (`pnpm --filter @barbearia/contracts build`)
- [X] T003 [P] Adicionar `expo-secure-store` (versão compatível com o Expo SDK 58, via `npx expo install expo-secure-store`) a `apps/barber/package.json`
- [X] T004 [P] Adicionar o serviço `mailpit` a `docker-compose.yml` (imagem `axllent/mailpit` com tag fixa estável, portas `${MAILPIT_SMTP_PORT:-1025}:1025` e `${MAILPIT_UI_PORT:-8025}:8025`, healthcheck) e as variáveis novas de [research.md R16](research.md#r16-variáveis-de-ambiente-novas) a `.env.example` (`DATABASE_URL`, `DATABASE_ADMIN_URL`, `APP_RUNTIME_PASSWORD`, `SMTP_URL`, `SMTP_FROM`, `ADMIN_BASE_URL`, `SESSION_COOKIE_SECURE`, `MAILPIT_SMTP_PORT`, `MAILPIT_UI_PORT`) com os padrões de desenvolvimento; confirmar que `pnpm infra:up` sobe os três serviços saudáveis
- [X] T005 [P] Adicionar os scripts de [contracts/commands.md](contracts/commands.md): na raiz `db:migrate` (`pnpm --filter @barbearia/api db:migrate`) e `test:integration` (`turbo run test:integration`); em `apps/api/package.json` `db:generate` (`drizzle-kit generate`), `db:migrate` (`nest build && node --env-file-if-exists=../../.env dist/db/migrate.js`), `cli` (`nest build && node --env-file-if-exists=../../.env dist/cli/main.js`; os argumentos de `pnpm --filter @barbearia/api cli <comando> ...` chegam ao `node`; sem `tsx` nem outra ferramenta nova, igual em PowerShell e bash) e `test:integration` (`vitest run --config vitest.integration.config.ts`); em `turbo.json` a tarefa `test:integration` com `cache: false`
- [X] T006 [P] Em `apps/api`, excluir `test/integration/**` de `vitest.config.ts` (para `pnpm test` seguir sem banco) e criar `vitest.integration.config.ts` (inclui só `test/integration/**`, `fileParallelism: false`, `testTimeout: 30000`, mesmo plugin `unplugin-swc` do config atual, `globalSetup` apontando para `test/integration/helpers/global-setup.ts`); criar também `apps/api/test/vitest-config.spec.ts`, que garante que `vitest.config.ts` não inclui `test/integration/**` (assim `pnpm test` nunca abre conexão com o banco, inclusive no job `windows`)

---

## Phase 2: Foundational (bloqueia todas as user stories)

**Purpose**: regras puras do domínio em TDD, esquema do banco com RLS, acesso a dados por transação, sessão, auditoria, e-mail e o esqueleto do módulo de identidade.

**⚠️ CRITICAL**: nenhuma user story começa antes desta fase.

- [X] T007 [P] Escrever `packages/domain/test/identidade/email.spec.ts` (devem falhar): `normalizarEmail` apara espaços e converte para minúsculas, e mantém um e-mail já normalizado idêntico
- [X] T008 [P] Escrever `packages/domain/test/identidade/senha.spec.ts` (devem falhar): `validarSenha(senha, { email, nome })` recusa senha com menos de 8 caracteres, com mais de 128, presente na lista de senhas comuns (por exemplo `12345678`, `password`, `senha123`), igual ao e-mail ou ao nome (sem diferenciar maiúsculas); aceita senha de 8 caracteres não óbvia; devolve o **motivo** (`curta`, `longa`, `comum`, `igual_ao_email`, `igual_ao_nome`)
- [X] T009 [P] Escrever `packages/domain/test/identidade/sessao.spec.ts` (devem falhar): `duracaoSessao('dono')` = 12 horas, `duracaoSessao('barbeiro')` = 30 dias; `calcularExpiracao(papel, agora)` soma a duração à hora recebida (sem ler o relógio); `sessaoVigente(sessao, agora)` é falsa se revogada ou expirada
- [X] T010 [P] Escrever `packages/domain/test/identidade/bloqueio.spec.ts` (devem falhar): `registrarFalhaLogin(estado, agora)` incrementa `tentativasFalhas`; a 5ª falha seguida define `bloqueadoAte = agora + 15 minutos`; `avaliarTentativaLogin(estado, agora)` devolve `bloqueado` enquanto `bloqueadoAte` estiver no futuro e `liberado` depois (zerando o contador); `registrarSucessoLogin` zera `tentativasFalhas` e `bloqueadoAte`
- [X] T011 [P] Escrever `packages/domain/test/identidade/token.spec.ts` (devem falhar): `VALIDADE_CONVITE` = 7 dias e `VALIDADE_RECUPERACAO` = 1 hora; `tokenVigente(token, agora)` é verdadeiro só se `usadoEm` e `invalidadoEm` forem nulos e `expiraEm` estiver no futuro; bordas: expira exatamente em `agora` é inválido
- [X] T012 [P] Escrever `packages/domain/test/identidade/equipe.spec.ts` (devem falhar): `podeDesativar(usuario, usuariosDaBarbearia)` é falso para o último usuário com papel `dono` e situação `ativo`, verdadeiro quando há outro dono ativo, e sempre verdadeiro para `barbeiro`; um dono `desativado` não conta como dono ativo
- [X] T013 [P] Implementar `packages/domain/src/identidade/email.ts` (`normalizarEmail`) até os testes de T007 passarem
- [X] T014 [P] Implementar `packages/domain/src/identidade/senha.ts` e `packages/domain/src/identidade/senhas-comuns.ts` (lista embutida das senhas mais comuns, em minúsculas) até os testes de T008 passarem
- [X] T015 [P] Implementar `packages/domain/src/identidade/sessao.ts` até os testes de T009 passarem
- [X] T016 [P] Implementar `packages/domain/src/identidade/bloqueio.ts` (constantes `MAX_FALHAS_LOGIN = 5` e `DURACAO_BLOQUEIO_MS = 15 * 60 * 1000`) até os testes de T010 passarem
- [X] T017 [P] Implementar `packages/domain/src/identidade/token.ts` até os testes de T011 passarem
- [X] T018 [P] Implementar `packages/domain/src/identidade/equipe.ts` até os testes de T012 passarem
- [X] T019 Criar `packages/domain/src/identidade/index.ts` e exportar em `packages/domain/src/index.ts` (apenas funções puras, sem dependências de runtime; `pnpm lint` valida a pureza do domínio); depende de T013, T014, T015, T016, T017, T018
- [X] T020 [P] Criar `packages/contracts/src/identidade/comum.ts` com schemas Zod: `Papel` (`dono`|`barbeiro`), `Situacao` (`convidado`|`ativo`|`desativado`), `Email` (aparado, minúsculas, formato válido), `Usuario` (`id`, `nome`, `email`, `papel`, `situacao`, `barbeariaId`, sem `senha_hash`, tokens ou contadores) e `Erro` (`codigo`, `mensagem`, `campos?`) conforme [contracts/api.md](contracts/api.md#convenções); exportar em `packages/contracts/src/index.ts` e cobrir com `packages/contracts/test/comum.spec.ts` (aceita o válido, recusa e-mail malformado e papel desconhecido)
- [X] T021 [P] Criar `apps/api/src/config/env.ts` (leitura e validação com Zod das variáveis de [research.md R16](research.md#r16-variáveis-de-ambiente-novas), com os padrões de desenvolvimento) e `apps/api/test/env.spec.ts` (padrões aplicados; valor inválido falha com mensagem clara)
- [X] T022 Criar `apps/api/src/identidade/relogio.ts`: porta `Relogio` (`agora(): Date`), adaptador do sistema e adaptador controlável (`avancar(ms)`, `definir(data)`) para testes; registrar no `IdentidadeModule` e injetar em `SessaoService`, `AuthService`, `ConvitesService`, `EquipeService` e `RecuperacaoService` (nenhum serviço lê `Date.now()` diretamente); teste `apps/api/test/relogio.spec.ts`
- [X] T023 [P] Criar `apps/api/drizzle.config.ts` (dialeto `postgresql`, esquema `src/db/schema`, saída `drizzle/`, `DATABASE_ADMIN_URL`)
- [X] T024 [P] Criar `apps/api/src/db/schema/barbearia.ts`: tabela `barbearia` com `id` uuid PK (`gen_random_uuid()`), `nome` texto obrigatório (1 a 120 caracteres, aparado), `criada_em` timestamptz padrão `now()`
- [X] T025 [P] Criar `apps/api/src/db/schema/unidade.ts`: `id` uuid PK, `tenant_id` FK → `barbearia.id`, `nome` obrigatório (1 a 120 caracteres), `fuso_horario` texto (nome IANA, ex.: `America/Sao_Paulo`), `criada_em`
- [X] T026 [P] Criar `apps/api/src/db/schema/usuario.ts`: `id` uuid PK, `tenant_id` FK, `nome` obrigatório (1 a 120 caracteres), `email` com `CHECK (email = lower(email))` e **índice único global**, `papel` enum `dono`|`barbeiro` (imutável), `situacao` enum `convidado`|`ativo`|`desativado`|`anonimizado`, `senha_hash` texto nulo, `tentativas_falhas` inteiro padrão 0, `bloqueado_ate` timestamptz nulo, `criado_em`, `desativado_em` nulo, `anonimizado_em` nulo; `CHECK`: `situacao = 'ativo'` exige `senha_hash` não nulo; `anonimizado` exige `senha_hash` nulo e `anonimizado_em` preenchido
- [X] T027 [P] Criar `apps/api/src/db/schema/token-acesso.ts`: `id` uuid PK, `tenant_id` FK, `usuario_id` FK → `usuario.id`, `finalidade` enum `convite`|`recuperacao`, `token_hash` bytea **único**, `expira_em`, `usado_em` nulo, `invalidado_em` nulo, `criado_em`
- [X] T028 [P] Criar `apps/api/src/db/schema/sessao.ts`: `id` uuid PK, `tenant_id` FK, `usuario_id` FK, `token_hash` bytea **único**, `criada_em`, `ultimo_uso_em`, `expira_em`, `revogada_em` nulo
- [X] T029 [P] Criar `apps/api/src/db/schema/evento-seguranca.ts`: `id` uuid PK, `tenant_id` FK **nulo**, `tipo` enum (`barbearia_provisionada`, `convite_enviado`, `convite_aceito`, `login_sucesso`, `login_falha`, `logout`, `senha_recuperacao_solicitada`, `senha_redefinida`, `usuario_desativado`, `usuario_reativado`, `usuario_anonimizado`), `ator_tipo` enum `usuario`|`plataforma`|`sistema`, `ator_usuario_id` nulo, `alvo_usuario_id` nulo, `detalhe` jsonb (somente dados não pessoais), `ocorrido_em` padrão `now()`
- [X] T030 Criar `apps/api/src/db/schema/index.ts` reexportando as seis tabelas; depende de T024, T025, T026, T027, T028, T029
- [X] T031 Gerar a migration inicial com `pnpm --filter @barbearia/api db:generate` e **revisar** o SQL em `apps/api/drizzle/` (tabelas, enums, FKs, índice único de e-mail, `CHECK`s); depende de T023, T030
- [X] T032 Criar migration customizada (`drizzle-kit generate --custom --name=rls-e-permissoes`) em `apps/api/drizzle/`: `ENABLE` e `FORCE ROW LEVEL SECURITY` em todas as tabelas; política `tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid` em `USING` e `WITH CHECK` (em `barbearia`, usando `id`); em `evento_seguranca`, `INSERT` aceita `tenant_id IS NULL` ou igual ao contexto e `SELECT` só o próprio tenant; `GRANT` mínimo ao papel `app_runtime` (`SELECT/INSERT/UPDATE` conforme a tabela; **somente `INSERT` e `SELECT` em `evento_seguranca`**; nenhum `DELETE`); depende de T031
- [X] T033 Criar migration customizada (`--name=funcoes-de-autenticacao`): funções `SECURITY DEFINER` `auth_buscar_usuario_por_email(email text)`, `auth_buscar_sessao(token_hash bytea)` e `auth_buscar_token_acesso(token_hash bytea, finalidade text)`, com `SET search_path = pg_catalog, public`, devolvendo **exatamente** as colunas de [contracts/api.md](contracts/api.md#apoio-de-banco); `REVOKE ALL FROM PUBLIC` e `GRANT EXECUTE` só a `app_runtime`; depende de T032
- [X] T034 Criar migration customizada (`--name=gatilhos-de-integridade`): gatilho `BEFORE UPDATE OR DELETE` em `evento_seguranca` que levanta erro para qualquer papel; gatilho em `usuario` que recusa mudar `situacao` para `desativado` ou `anonimizado` do **último** usuário `dono` `ativo` do tenant e recusa alterar `papel`; depende de T032
- [X] T035 Criar `apps/api/src/db/migrate.ts`: usando `DATABASE_ADMIN_URL`, garante o papel `app_runtime` de forma idempotente (`CREATE ROLE ... LOGIN` se não existir, senha de `APP_RUNTIME_PASSWORD`, sem `BYPASSRLS`) e aplica as migrations; rodar `pnpm db:migrate` duas vezes seguidas e conferir que a segunda não altera nada; depende de T033, T034
- [X] T036 Criar os helpers de integração em `apps/api/test/integration/helpers/`: `global-setup.ts` (cria um banco de teste exclusivo da execução via `DATABASE_ADMIN_URL`, aplica `migrate.ts` e o remove no fim), `db.ts` (conexões `admin` e `runtime`), `fabrica.ts` (cria barbearia + unidade + usuário em um tenant, com sessão, para os testes); o helper `app.ts` fica na tarefa seguinte ao `IdentidadeModule`; depende de T035 `global-setup.ts` cria também um papel `owner_teste` `NOSUPERUSER NOBYPASSRLS CREATEROLE` (o `CREATEROLE` é necessário para `migrate.ts` criar `app_runtime`), dono do banco de teste; as migrations dos testes rodam **como** `owner_teste`, para que ele seja o dono das tabelas, e ele é a conexão administrativa dos testes, para que `FORCE ROW LEVEL SECURITY` valha também para ela (ver [R2](research.md#r2-isolamento-por-rls-e-papéis-do-banco));
- [X] T037 Escrever `apps/api/test/integration/tenant-db.spec.ts` (deve falhar): com duas barbearias, `TenantDb.transacao(tenantA, ...)` enxerga só linhas de A; sem contexto, `SELECT` devolve 0 linhas e `INSERT` falha; contexto de A não grava linha com `tenant_id` de B; o valor do tenant é passado por parâmetro (`set_config`), nunca concatenado; depende de T036
- [X] T038 Criar `apps/api/src/db/tenant-db.ts` e `apps/api/src/db/db.module.ts`: `TenantDb.transacao(tenantId, fn)` abre a transação com `set_config('app.tenant_id', $1, true)` e entrega o executor Drizzle; `TenantDb.semTenant()` expõe só as chamadas às três funções `auth_*`; conexão da API usa `DATABASE_URL` (papel `app_runtime`); até T037 passar; depende de T021, T037
- [X] T039 [P] Criar `apps/api/src/identidade/seguranca/tokens.ts` (`gerarToken()` com 32 bytes aleatórios em base64url e `hashToken()` SHA-256) e `apps/api/test/tokens.spec.ts` (tokens distintos, 256 bits, hash determinístico e diferente do token)
- [X] T040 [P] Criar `apps/api/src/identidade/seguranca/senha.service.ts`: hash e verificação com **argon2id** (memória 19 MiB, 2 iterações, 1 de paralelismo, ajustáveis por ambiente) e `verificarSenhaFicticia()` que gasta o mesmo tempo quando o e-mail não existe ([R5](research.md#r5-senha)); cobrir com `apps/api/test/senha.service.spec.ts`
- [X] T041 [P] Criar `apps/api/src/identidade/auditoria/auditoria.service.ts`: `registrar({ tipo, atorTipo, atorUsuarioId?, alvoUsuarioId?, tenantId?, detalhe? })` dentro da transação do chamador; rejeita `detalhe` que contenha as chaves `email`, `nome`, `senha`, `token` ou `ip` (princípio IX); cobrir com `apps/api/test/integration/auditoria.service.spec.ts`; depende de T038
- [X] T042 [P] Criar `apps/api/src/identidade/email/`: `email.port.ts` (`EmailPort.enviar({ para, assunto, texto })`), `smtp.adapter.ts` (nodemailer com `SMTP_URL` e `SMTP_FROM`), `memoria.adapter.ts` (guarda as mensagens para os testes) e `modelos.ts` com os textos em português de **convite** (link `{ADMIN_BASE_URL}/convite/{token}`, validade de 7 dias) e **recuperação** (link `{ADMIN_BASE_URL}/redefinir-senha/{token}`, validade de 1 hora); o envio nunca registra destinatário nem link em log
- [X] T043 Criar `apps/api/src/identidade/auth/sessao.service.ts`: `iniciar(tx, usuario)` (token novo, grava só o hash, `expira_em` via `calcularExpiracao`), `resolver(token)` (usa `auth_buscar_sessao`; recusa revogada, expirada ou usuário não `ativo`; renova `ultimo_uso_em` e `expira_em` no máximo a cada 1 minuto), `revogar(tx, sessaoId)` e `revogarTodas(tx, usuarioId)`; depende de T038, T039, T019 Usa `Relogio` (T022), nunca `Date.now()`.
- [X] T044 Criar em `apps/api/src/identidade/auth/`: `auth.guard.ts` (global; lê cookie `sessao` ou `Authorization: Bearer`, resolve a sessão e injeta usuário, papel e tenant; `401 SESSAO_INVALIDA` sem sessão válida), `decorators.ts` (`@Publica()`, `@Papeis('dono')`, `@UsuarioAtual()`), `origem.guard.ts` (com cookie, exige `Origin` igual a `ADMIN_BASE_URL` em métodos que alteram estado, `403 ORIGEM_INVALIDA`) e `cookie.ts` (lê o cabeçalho `Cookie` e define `HttpOnly`, `SameSite=Lax`, `Secure` conforme `SESSION_COOKIE_SECURE`), sem biblioteca de cookies; depende de T043
- [X] T045 [P] Criar `apps/api/src/identidade/http/`: filtro de exceções que responde `{ codigo, mensagem, campos? }` ([contracts/api.md](contracts/api.md#convenções)) e `zod.pipe.ts` que valida entradas com os schemas de `@barbearia/contracts` e responde `400 DADOS_INVALIDOS` com `campos`; cobrir com `apps/api/test/http-errors.spec.ts`; depende de T020 O filtro registra apenas `codigo`, rota e status; nunca corpo da requisição, e-mail, nome, token nem IP; falhas de SMTP registram só o tipo da mensagem (convite ou recuperação).
- [X] T046 Criar `apps/api/src/identidade/identidade.module.ts` reunindo DbModule, serviços e guards (guard de autenticação e de origem registrados como globais, com `@Publica()` para o `GET /health` existente) e importá-lo em `apps/api/src/app.module.ts`; confirmar que `apps/api/test/health.spec.ts` segue passando; depende de T044, T045, T041, T042, T040
- [X] T047 Criar `apps/api/test/integration/helpers/app.ts`: sobe o app Nest com o `IdentidadeModule`, `EmailPort` em memória (guarda as mensagens para os testes) e o adaptador controlável de `Relogio` (T022), sobre o banco de teste do harness; depende de T046, T036

**Checkpoint**: `pnpm test` (domínio e contratos) passa; `pnpm db:migrate` aplica o esquema; `tenant-db.spec.ts` passa; o app Nest sobe com o `IdentidadeModule`.

---

## Phase 3: User Story 1 - Provisionar a barbearia e dar acesso ao dono (Priority: P1) 🎯 MVP

**Goal**: equipe do produto provisiona a barbearia; o dono aceita o convite, define a senha e entra vendo só a própria barbearia (FR-001 a FR-003, FR-009, FR-022).

**Independent Test**: Provisionar uma barbearia, aceitar o convite como dono e chamar `GET /auth/eu`: devolve só a barbearia dele, com a unidade inicial e o fuso (cenário 2 do [quickstart.md](quickstart.md)).

- [X] T048 [P] [US1] Criar `packages/contracts/src/identidade/convite.ts` com os schemas de `GET /auth/convites/{token}` (`{ nome, barbearia }`), `POST /auth/convites/aceitar` (entrada `{ token, senha, cliente: 'web'|'mobile' }`, saída `{ usuario, token? }`) e do comando de provisionamento (`nome` 1 a 120 caracteres, `unidade` 1 a 120, `fuso` nome IANA, `donoNome` 1 a 120, `donoEmail`); testes em `packages/contracts/test/convite.spec.ts`
- [X] T049 [US1] Escrever `apps/api/test/integration/provisionar.spec.ts` (deve falhar), conforme [contracts/commands.md](contracts/commands.md#provisionar-barbearia): cria barbearia, unidade e dono `convidado` numa só transação; envia o convite (7 dias); e-mail já usado falha sem criar nada; fuso inexistente falha sem criar nada; falha no meio não deixa nada pela metade; grava `barbearia_provisionada` com `ator_tipo = plataforma`; a saída não contém token nem link; depende de T036 Inclui concorrência: dois provisionamentos simultâneos com o mesmo e-mail — exatamente um tem sucesso, o outro falha com `E-mail indisponível` e nada fica pela metade.
- [X] T050 [US1] Escrever `apps/api/test/integration/convites.spec.ts` (deve falhar), conforme [contracts/api.md](contracts/api.md#convite-primeiro-acesso): `GET /auth/convites/{token}` devolve nome e barbearia; token usado, expirado, invalidado ou inexistente responde o mesmo `410 CONVITE_INVALIDO`; `POST /auth/convites/aceitar` com senha válida ativa o usuário, define a sessão (cookie para `web`, `token` no corpo para `mobile`), marca o token como usado e grava `convite_aceito`; senha fraca responde `400 SENHA_FRACA` com `campos.senha`; reutilizar o token falha; `GET /auth/eu` com a sessão devolve usuário e barbearia e **só** a própria; depende de T036 Inclui: não existe rota HTTP para provisionar, reenviar convite de dono nem anonimizar — `POST /provisionar-barbearia`, `/plataforma/*` e `/anonimizar` respondem 404 (FR-022).
- [X] T051 [US1] Criar `apps/api/src/identidade/provisionamento/provisionamento.service.ts`: numa única transação com a conexão administrativa, valida o fuso contra `Intl.supportedValuesOf('timeZone')`, recusa e-mail existente com `E-mail indisponível`, cria `barbearia`, `unidade` (nome e fuso), `usuario` dono com `situacao = convidado` e `token_acesso` de convite com validade de 7 dias, e registra `barbearia_provisionada`; envia o e-mail **após o commit**; depende de T048, T042, T041, T019 Define `app.tenant_id` (UUID gerado na aplicação antes dos `INSERT`) antes de qualquer escrita e **não** depende de ignorar a RLS (ver [R2](research.md#r2-isolamento-por-rls-e-papéis-do-banco)).
- [X] T052 [US1] Criar `apps/api/src/cli/main.ts` e `apps/api/src/cli/provisionar-barbearia.ts` (`util.parseArgs` do Node, compilado em `dist/cli/main.js`, contexto de aplicação do Nest com `DATABASE_ADMIN_URL`; opções `--nome --unidade --fuso --dono-nome --dono-email`; imprime só o id da barbearia; código de saída ≠ 0 em qualquer falha), sem rota HTTP; até T049 passar; depende de T051
- [X] T053 [US1] Escrever `apps/api/test/integration/reenviar-convite-dono.spec.ts` (deve falhar), conforme [contracts/commands.md](contracts/commands.md#reenviar-convite-dono): reenvia o convite de um dono `convidado` e o link anterior passa a dar `410 CONVITE_INVALIDO`; recusa dono já `ativo` e barbeiro; `--novo-email` corrige o e-mail e recusa e-mail já usado; evento `convite_enviado` com `ator_tipo = plataforma`; depende de T036
- [X] T054 [US1] Criar `apps/api/src/cli/reenviar-convite-dono.ts` e registrá-lo em `apps/api/src/cli/main.ts` (contexto de tenant explícito, como em [R2](research.md#r2-isolamento-por-rls-e-papéis-do-banco)), até T053 passar; depende de T052
- [X] T055 [US1] Criar `apps/api/src/identidade/convites/convites.service.ts` e `convites.controller.ts` (`@Publica()`, com o limite de 20/min por IP; `GET /auth/convites/{token}` e `POST /auth/convites/aceitar`): usa `auth_buscar_token_acesso`, valida com `tokenVigente` e `validarSenha` do domínio, grava o hash Argon2id, marca o token como usado, ativa o usuário, inicia a sessão e registra `convite_aceito`; depende de T048, T043, T040 Usa `Relogio` (T022), nunca `Date.now()`.
- [X] T056 [US1] Criar `GET /auth/eu` em `apps/api/src/identidade/auth/auth.controller.ts` (`200 { usuario, barbearia: { id, nome } }`, protegido pelo guard) e o schema em `packages/contracts/src/identidade/auth.ts`; até T050 passar; depende de T055
- [X] T057 [P] [US1] Criar `apps/admin/lib/api.ts` (cliente fino da API: `fetch` com `credentials: 'include'`, base `NEXT_PUBLIC_API_URL` padrão `http://localhost:3000`, tipos de `@barbearia/contracts`, erros no formato `Erro`) e liberar CORS para `ADMIN_BASE_URL` com credenciais em `apps/api/src/main.ts`
- [X] T058 [US1] Criar `apps/admin/app/convite/[token]/page.tsx` (e componente de formulário): consulta o convite, mostra nome e barbearia, pede a senha com as regras visíveis (mínimo de 8 caracteres), exibe `SENHA_FRACA` junto ao campo e, ao aceitar, redireciona para `/`; para convite inválido mostra "Este convite não é mais válido. Peça um novo ao dono da barbearia."; define `Referrer-Policy: no-referrer` na rota em `apps/admin/next.config.ts`; mobile-first; depende de T057
- [X] T059 [US1] Atualizar `apps/admin/app/page.tsx` para consultar `GET /auth/eu` e mostrar o nome do usuário, a barbearia e o fuso da unidade inicial (tela provisória, substituída pela Equipe em US4); sem sessão, redireciona para `/entrar` (criada em US2); depende de T057

**Checkpoint**: o teste independente da história passa e `pnpm test`, `pnpm lint`, `pnpm typecheck` seguem verdes.

---

## Phase 4: User Story 2 - Entrar e sair do sistema (Priority: P1)

**Goal**: usuário ativo entra, sai, e é bloqueado após falhas, sem revelar se o e-mail existe (FR-010 a FR-015).

**Independent Test**: Entrar e sair; errar a senha 5 vezes e ver o mesmo `401` com a senha certa; comparar e-mail inexistente x senha errada x bloqueada (cenário 3).

- [ ] T060 [P] [US2] Completar `packages/contracts/src/identidade/auth.ts` com `POST /auth/login` (entrada `{ email, senha, cliente }`, saída `{ usuario, token? }`) e `POST /auth/logout`; testes em `packages/contracts/test/auth.spec.ts`
- [ ] T061 [US2] Escrever `apps/api/test/integration/auth.spec.ts` (deve falhar), conforme [contracts/api.md](contracts/api.md#post-authlogin--pública): login correto para `web` (cookie, sem `token`) e `mobile` (`token` no corpo, sem cookie); logout invalida a sessão (`401 SESSAO_INVALIDA` depois); e-mail inexistente, senha errada, conta `convidado`, `desativado` e **conta bloqueada com a senha correta** respondem o **mesmo** `401 CREDENCIAIS_INVALIDAS` (mesmo corpo e status); a 5ª falha seguida bloqueia por 15 minutos (adaptador controlável de `Relogio` (T022)) e login válido zera o contador; sessão de dono expira após 12 horas e a de barbeiro após 30 dias de inatividade; mais de 20 tentativas por minuto do mesmo IP respondem `429` com `Retry-After`; eventos `login_sucesso`, `login_falha` e `logout` gravados sem e-mail, nome ou IP; depende de T036
- [ ] T062 [US2] Criar `apps/api/src/identidade/auth/auth.service.ts`: `login` usa `auth_buscar_usuario_por_email`, executa `verificarSenhaFicticia()` quando o e-mail não existe, aplica `avaliarTentativaLogin`/`registrarFalhaLogin`/`registrarSucessoLogin` do domínio sob o contexto do tenant, inicia a sessão e registra `login_sucesso` ou `login_falha`; `logout` revoga a sessão atual e registra `logout`; todos os caminhos de falha devolvem o mesmo `CREDENCIAIS_INVALIDAS` com tempo equivalente; depende de T060, T043, T040, T041 Usa `Relogio` (T022), nunca `Date.now()`.
- [ ] T063 [US2] Completar `apps/api/src/identidade/auth/auth.controller.ts` com `POST /auth/login` (`@Publica()`) e `POST /auth/logout` (`204`), configurar `ThrottlerModule` em `identidade.module.ts` (20 requisições por minuto por IP, padrão por ambiente, armazenamento em memória; IP **não** é gravado em lugar nenhum) aplicado a login, convites e recuperação; até T061 passar; depende de T062
- [ ] T064 [US2] Criar `apps/admin/app/entrar/page.tsx` (e componente): e-mail e senha, mensagem "E-mail ou senha incorretos, ou acesso temporariamente bloqueado.", botão de sair no cabeçalho do admin (`apps/admin/app/layout.tsx`), redireciona para `/` após entrar; mobile-first; depende de T063, T057
- [ ] T065 [P] [US2] Criar `apps/barber/lib/api.ts` (cliente fino com base `EXPO_PUBLIC_API_URL` padrão `http://localhost:3000`) e `apps/barber/lib/sessao.ts` (guarda, lê e apaga o token com `expo-secure-store`; envia `Authorization: Bearer`); depende de T003
- [ ] T066 [US2] Criar `apps/barber/app/entrar.tsx` (login com `cliente: 'mobile'`, guarda o token, mensagem genérica de falha) e atualizar `apps/barber/app/index.tsx` e `_layout.tsx`: sem token vai para `/entrar`; com token mostra o nome do barbeiro (`GET /auth/eu`) e o botão **Sair** (revoga e apaga o token); depende de T065, T063

**Checkpoint**: o teste independente da história passa e `pnpm test`, `pnpm lint`, `pnpm typecheck` seguem verdes.

---

## Phase 5: User Story 3 - Isolamento entre barbearias (Priority: P1)

**Goal**: uma barbearia nunca vê nem altera dados de outra, garantido no banco (FR-017 a FR-019, SC-003).

**Independent Test**: `pnpm test:integration` com `rls.spec.ts` e `vazamento.spec.ts` passando; remover uma política de RLS faz a suíte falhar (cenário 6).

- [ ] T067 [US3] Escrever `apps/api/test/integration/rls.spec.ts`, conforme [data-model.md](data-model.md) e [R2](research.md#r2-isolamento-por-rls-e-papéis-do-banco): com duas barbearias e a conexão `app_runtime`, em **cada** tabela com `tenant_id` — sem contexto, `SELECT` devolve 0 linhas e `INSERT`/`UPDATE`/`DELETE` não afetam nada ou falham; com o contexto de A, não lê, não atualiza e não insere linha de B; `app_runtime` não tem `BYPASSRLS` nem é dono das tabelas; as três funções `auth_*` só são executáveis por `app_runtime`; `evento_seguranca` recusa `UPDATE` e `DELETE` mesmo pela conexão administrativa; eventos com `tenant_id` nulo não aparecem a nenhuma barbearia; depende de T036
- [ ] T068 [US3] Escrever `apps/api/test/integration/vazamento.spec.ts` com a suíte de **vazamento entre barbearias** (FR-018, FR-019, SC-003) sobre os endpoints existentes: sessão da barbearia A nunca obtém dados de B em `GET /auth/eu`; token de convite de B usado por A não revela nada além do `410`/dados do próprio convite; estrutura em tabela (`it.each` sobre uma lista de rotas) para que as rotas de equipe (US4) e recuperação (US5) sejam acrescentadas a ela; depende de T036
- [ ] T069 [US3] Corrigir quaisquer lacunas apontadas por T067 e T068 nas migrations (`apps/api/drizzle/`) ou no código (nunca enfraquecendo o teste), até os dois arquivos passarem; confirmar manualmente que remover uma política de RLS faz `rls.spec.ts` falhar

**Checkpoint**: o teste independente da história passa e `pnpm test`, `pnpm lint`, `pnpm typecheck` seguem verdes.

---

## Phase 6: User Story 4 - Dono adiciona e gerencia a equipe (Priority: P2)

**Goal**: o dono convida, desativa e reativa barbeiros e outros donos; a equipe do produto anonimiza dados pessoais (FR-004 a FR-008, FR-024).

**Independent Test**: Como dono: convidar barbeiro, desativá-lo com a sessão aberta e ver o acesso cair; reativar; tentar desativar o único dono (cenários 4 e 7).

- [ ] T070 [P] [US4] Criar `packages/contracts/src/identidade/equipe.ts` com os schemas de `GET /equipe`, `POST /equipe/convites` (entrada `{ nome: 1 a 120 caracteres, email, papel: 'dono'|'barbeiro' }`), `reenviar-convite`, `desativar` e `reativar`; testes em `packages/contracts/test/equipe.spec.ts`
- [ ] T071 [US4] Escrever `apps/api/test/integration/equipe.spec.ts` (deve falhar), conforme [contracts/api.md](contracts/api.md#equipe-papel-dono): dono convida barbeiro (`201`, e-mail enviado, `convite_enviado`); `barbeiro` recebe `403 SEM_PERMISSAO` em todas as rotas; e-mail já usado em **qualquer** barbearia responde o mesmo `409 EMAIL_INDISPONIVEL`; dono convida outro dono e o papel não muda depois; `reenviar-convite` invalida o link anterior; `desativar` revoga as sessões abertas e recusa novo login; `409 ULTIMO_DONO` ao desativar o único dono ativo (inclusive a si mesmo); `reativar` com senha volta a `ativo` com as mesmas credenciais e, sem senha, volta a `convidado` com novo convite; `GET /equipe` lista só a própria barbearia (sem `anonimizado`); **id de outra barbearia responde `404 NAO_ENCONTRADO`, idêntico a id inexistente**, em `desativar`, `reativar` e `reenviar-convite`; acrescentar essas rotas à tabela de T068; depende de T036 Inclui concorrência: dois `desativar` simultâneos dos dois únicos donos ativos — no máximo um é aceito e a barbearia nunca fica sem dono ativo (gatilho de integridade).
- [ ] T072 [US4] Criar `apps/api/src/identidade/equipe/equipe.service.ts`: listar, convidar (cria usuário `convidado` e convite de 7 dias, envia o e-mail após o commit), reenviar (invalida o token anterior, cria outro), desativar (`podeDesativar` do domínio; revoga todas as sessões e invalida convites pendentes; `usuario_desativado`) e reativar (`usuario_reativado`), tudo via `TenantDb.transacao`; e-mail duplicado em qualquer barbearia vira `EMAIL_INDISPONIVEL` sem revelar a outra barbearia; depende de T070, T043, T041, T042, T019 Usa `Relogio` (T022), nunca `Date.now()`.
- [ ] T073 [US4] Criar `apps/api/src/identidade/equipe/equipe.controller.ts` com as cinco rotas de [contracts/api.md](contracts/api.md#equipe-papel-dono), todas com `@Papeis('dono')`; até T071 passar; depende de T072
- [ ] T074 [US4] Criar `apps/admin/app/equipe/page.tsx` (lista com nome, papel e situação; formulário de convite com papel; ações Reenviar convite, Desativar e Reativar com confirmação; erros `ULTIMO_DONO` e `EMAIL_INDISPONIVEL` em português) e fazer `/` redirecionar para `/equipe` (substitui a tela provisória de US1); mobile-first; depende de T073, T057
- [ ] T075 [US4] Escrever `apps/api/test/integration/anonimizar.spec.ts` (deve falhar), conforme [contracts/commands.md](contracts/commands.md#anonimizar-usuario): recusa usuário que não está `desativado`; recusa o último dono ativo; anonimiza nome (`Usuário anonimizado`) e e-mail (`anonimizado-<id>@invalid`), apaga `senha_hash`, revoga sessões e tokens, define `situacao = anonimizado`; o e-mail original fica livre para novo convite; é idempotente; os eventos anteriores permanecem, ligados só ao `id`; nenhuma resposta, tabela de usuários ou evento contém o nome ou e-mail originais (SC-008); evento `usuario_anonimizado` com `ator_tipo = plataforma`; depende de T036
- [ ] T076 [US4] Criar `apps/api/src/identidade/provisionamento/anonimizacao.service.ts` e `apps/api/src/cli/anonimizar-usuario.ts` (`--email`; usa `DATABASE_ADMIN_URL`; a saída identifica o usuário só pelo `id`); registrar o subcomando em `apps/api/src/cli/main.ts`; até T075 passar; depende de T052, T075 Acha o usuário com `auth_buscar_usuario_por_email` e só então define `app.tenant_id`; não depende de ignorar a RLS (ver [R2](research.md#r2-isolamento-por-rls-e-papéis-do-banco)).

**Checkpoint**: o teste independente da história passa e `pnpm test`, `pnpm lint`, `pnpm typecheck` seguem verdes.

---

## Phase 7: User Story 5 - Recuperar o acesso quando esquecer a senha (Priority: P2)

**Goal**: o usuário redefine a senha por link de uso único, sem revelar se o e-mail existe (FR-016).

**Independent Test**: Pedir recuperação, usar o link, entrar com a nova senha; link reutilizado ou com mais de 1 hora é recusado; sessões antigas caem (cenário 5).

- [ ] T077 [P] [US5] Criar `packages/contracts/src/identidade/recuperacao.ts` com `POST /auth/senha/esqueci` (`{ email }`) e `POST /auth/senha/redefinir` (`{ token, senha }`); testes em `packages/contracts/test/recuperacao.spec.ts`
- [ ] T078 [US5] Escrever `apps/api/test/integration/recuperacao.spec.ts` (deve falhar), conforme [contracts/api.md](contracts/api.md#recuperação-de-senha): `esqueci` responde `202` com a mesma mensagem para e-mail existente e inexistente, com tempo equivalente, e só envia e-mail para conta `ativa`; pedir de novo invalida o link anterior; `redefinir` troca a senha, zera `tentativas_falhas` e `bloqueado_ate`, **revoga todas as sessões**, marca o token como usado e grava `senha_redefinida`; token usado, expirado (1 hora, adaptador controlável de `Relogio` (T022)) ou inexistente responde `410 TOKEN_INVALIDO`; senha fraca responde `400 SENHA_FRACA`; a senha antiga deixa de funcionar; acrescentar as rotas à tabela de T068; depende de T036
- [ ] T079 [US5] Criar `apps/api/src/identidade/recuperacao/recuperacao.service.ts` e `recuperacao.controller.ts` (`@Publica()`, com o limite por IP): `esqueci` (usa `auth_buscar_usuario_por_email`; invalida o token anterior; cria token de 1 hora; envia o e-mail após o commit; `senha_recuperacao_solicitada`; resposta e tempo idênticos quando a conta não existe) e `redefinir` (valida com `tokenVigente` e `validarSenha`, troca o hash, revoga as sessões, `senha_redefinida`); até T078 passar; depende de T077, T043, T040, T042, T041 Usa `Relogio` (T022), nunca `Date.now()`.
- [ ] T080 [US5] Criar `apps/admin/app/esqueci-senha/page.tsx` (pede o e-mail e sempre mostra "Se o e-mail estiver cadastrado, enviaremos as instruções."), `apps/admin/app/redefinir-senha/[token]/page.tsx` (nova senha com as regras visíveis; `Referrer-Policy: no-referrer`; ao concluir, leva a `/entrar`) e o link "Esqueci minha senha" em `apps/admin/app/entrar/`; depende de T079, T064

**Checkpoint**: o teste independente da história passa e `pnpm test`, `pnpm lint`, `pnpm typecheck` seguem verdes.

---

## Phase 8: Polish e validação

**Purpose**: contratos, CI, README e validação ponta a ponta.

- [ ] T081 Criar o registro de rotas em `packages/contracts/src/identidade/rotas.ts` (caminho, método, schemas de entrada e saída de cada endpoint de [contracts/api.md](contracts/api.md)) e `packages/contracts/scripts/openapi.ts` que gera o documento OpenAPI 3.1 com `z.toJSONSchema`; script `openapi` em `packages/contracts/package.json`; teste em `packages/contracts/test/rotas.spec.ts` garantindo que toda rota do controller tem entrada no registro; depende de T048, T060, T070, T077
- [ ] T082 Escrever `apps/api/test/integration/logs.spec.ts`: captura a saída do logger do Nest e do console durante login com falha, convite, recuperação de senha e erro de SMTP simulado, e confirma que nada contém o e-mail, nome, token, link ou IP usados no teste (princípio IX); depende de T063, T079, T073
- [ ] T083 Escrever `apps/api/test/integration/auditoria-completa.spec.ts`: percorre provisionar, convite enviado e aceito, login com sucesso e falha, logout, recuperação solicitada e redefinida, desativar, reativar e anonimizar, e confirma um evento de cada um dos 11 tipos com `ator_tipo`, autor (quando houver) e `ocorrido_em`, sem e-mail, nome, senha, token nem IP (SC-006); depende de T079, T076
- [ ] T084 Escrever os testes de contrato em `apps/api/test/integration/contract/` (um arquivo por endpoint público ou protegido de [contracts/api.md](contracts/api.md)) validando o formato das respostas de sucesso e de erro contra os schemas de `@barbearia/contracts`; depende de T081, T079, T073; depende também de T082, T083
- [ ] T085 Atualizar `.github/workflows/ci.yml`: no job `linux`, depois de `Infra up`, adicionar as etapas `Migrate` (`pnpm db:migrate`) e `Integration test` (`pnpm test:integration`), antes de `Infra check`/`Infra down`; o job `windows` não muda; registrar a mudança em `specs/001-repo-foundation/contracts/ci.md` ou apontar para [contracts/commands.md](contracts/commands.md#mudança-na-ci)
- [ ] T086 Atualizar `README.md`: Mailpit (`http://localhost:8025`), `pnpm db:migrate`, `pnpm test:integration`, variáveis novas do `.env.example`, e como a equipe do produto provisiona uma barbearia e anonimiza um usuário (comandos de [contracts/commands.md](contracts/commands.md)); **sem** colocar segredo nem link de convite em exemplos
- [ ] T087 Rodar `pnpm format`, `pnpm lint`, `pnpm typecheck`, `pnpm test` e `pnpm build` na raiz e corrigir o que falhar; conferir que `pnpm test` passa **sem** banco de pé e que `pnpm test:integration` passa com a infraestrutura de pé; depende de T085, T086, T084
- [ ] T088 Percorrer o [quickstart.md](quickstart.md) (cenários 1 a 8) em Linux e registrar divergências; conferir SC-001 a SC-008 (inclui a verificação manual de indistinguibilidade das respostas de login e dos tempos); depende de T087 O cenário 8 é automatizado por T083; os demais cenários seguem manuais.
- [ ] T089 Validar na pipeline real (cenário 9): push da branch e conferir `linux` (com `Migrate` e `Integration test`) e `windows` passando; em branch descartável remover uma política de RLS e confirmar que falha só `Integration test`, só em `linux`; apagar a branch descartável; depende de T088
- [ ] T090 Reavaliar o Constitution Check do [plan.md](plan.md) com os arquivos reais (RLS em todas as tabelas, API sem `BYPASSRLS`, domínio sem dependências de runtime, nenhum dado pessoal em logs ou eventos) e atualizar o plan se algo mudou; depende de T088

---

## Dependências e ordem de execução

- **Setup** (T001–T006): T001 primeiro (instala o workspace); as demais podem rodar em paralelo.
- **Foundational** (T007–T046): depende do Setup e **bloqueia todas as histórias**. Dentro dela: testes do domínio antes das implementações; esquema (T024–T030) antes das migrations (T031–T034); migrations antes do `migrate` (T035) e do harness (T036); `TenantDb` (T038) antes de auditoria, sessão e guard.
- **US1** depende só da Foundational. **US2** depende da Foundational e usa o cliente do admin criado em US1 (T057). **US3** depende de US1 e US2 apenas para ter endpoints a testar, mas T067 e T068 só precisam da Foundational. **US4** e **US5** dependem da Foundational e da sessão; as telas de US5 usam a tela de entrar de US2.
- **Polish** depende das histórias que quiser validar; T085 (CI) precisa dos testes de integração existirem.

### Ordem sugerida das histórias

US1 → US2 → US3 → US4 → US5. Cada uma entrega um incremento testável sozinho.

## Oportunidades de paralelismo

- Setup: T002, T003, T004, T005, T006 em paralelo.
- Foundational: os seis testes de domínio (T007–T012) em paralelo, depois as seis implementações (T013–T018) em paralelo; os seis arquivos de esquema (T024–T029) em paralelo; T039, T040, T042 e T045 em paralelo.
- Por história: o contrato (`*_c`) pode andar em paralelo com a escrita dos testes; telas do admin e do barbeiro podem andar em paralelo com a API depois que o contrato existe.

## Estratégia de implementação

1. **MVP = Setup + Foundational + US1**: provisionar uma barbearia pelo comando e o dono entrar pelo convite. Já valida RLS, esquema, e-mail e sessão de ponta a ponta.
2. **US2** adiciona login e logout (e o app do barbeiro), e **US3** trava o isolamento com a suíte de vazamento antes de qualquer dado de negócio existir.
3. **US4** e **US5** completam a gestão de equipe, a anonimização e a recuperação de senha.
4. Fazer commit ao fim de cada história, depois de `pnpm format:check`, `pnpm lint`, `pnpm typecheck` e `pnpm test` verdes (e `pnpm test:integration` quando houver infraestrutura).
