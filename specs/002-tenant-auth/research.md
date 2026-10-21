# Research: Barbearia, usuários e autenticação

Decisões técnicas da feature 002. A spec descreve o quê; aqui ficam o como e o porquê. Cada decisão tem alternativas rejeitadas.

## R1: ORM e migrations

**Decisão**: Drizzle ORM (`drizzle-orm` 0.45, driver `pg` 8) e `drizzle-kit` 0.31, conforme o [ADR 0002](../../docs/adr/0002-orm-e-migrations.md).

**Racional**: RLS declarada no esquema (`pgPolicy`), migrations SQL customizadas (`drizzle-kit generate --custom`) e contexto do tenant por transação (`set_config(..., true)`) são suportados pela documentação atual; sem binário nativo.

**Alternativas**: Prisma, Kysely, TypeORM e SQL puro, rejeitadas no ADR.

## R2: Isolamento por RLS e papéis do banco

**Decisão**: dois papéis de banco.

| Papel | Uso | Permissões |
|---|---|---|
| `barbearia` (dono do esquema, já existente em dev) | Migrations e comandos da equipe do produto (provisionar, anonimizar) | Dono das tabelas; contorna a RLS por ser dono |
| `app_runtime` | API em execução | `SELECT/INSERT/UPDATE` conforme a tabela; **não** é dono, sem `BYPASSRLS`; sem `DELETE` nas tabelas de auditoria |

- Todas as tabelas de negócio têm `tenant_id` e `ENABLE` + `FORCE ROW LEVEL SECURITY`.
- Política padrão: `tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid`, em `USING` e `WITH CHECK`. Sem contexto, o valor é `NULL` e **nenhuma linha** é visível nem gravável (falha fechada, FR-017).
- Contexto definido por `set_config('app.tenant_id', $1, true)` dentro de uma transação (`is_local = true`), por parâmetro. Nunca por concatenação de string.
- A tabela `barbearia` usa `id` como chave de tenant na política.

**Racional**: o princípio I exige RLS e testes de vazamento. Um papel sem `BYPASSRLS` e sem ser dono é o que faz a política valer de fato para a API. `FORCE` cobre o caso de a API um dia usar o dono.

**Alternativas**: filtrar por `tenant_id` só na aplicação (rejeitada: viola o princípio I); um banco ou esquema por tenant (rejeitada: custo operacional e migrations multiplicadas para o porte atual).

## R3: Consultas antes de saber o tenant (login, convite, sessão, recuperação)

**Problema**: para entrar, a API precisa achar o usuário por e-mail, ou a sessão/convite por token, **antes** de conhecer o tenant, mas a RLS esconde tudo sem contexto.

**Decisão**: funções `SECURITY DEFINER` mínimas, de propriedade do dono do esquema, com `SET search_path = pg_catalog, public` e `EXECUTE` concedido apenas a `app_runtime`:

- `auth_buscar_usuario_por_email(email text)`
- `auth_buscar_sessao(token_hash bytea)`
- `auth_buscar_token_acesso(token_hash bytea, finalidade text)`

Cada uma devolve só as colunas necessárias para autenticar (identificador, tenant, papel, situação, hash da senha, contadores de bloqueio). Depois de obter o `tenant_id`, a API abre a transação com o contexto e faz todo o resto sob RLS.

**Racional**: mantém a RLS valendo para tudo o que não é a busca inicial, e a superfície que contorna a RLS fica em três funções revisáveis.

**Alternativas**: papel com `BYPASSRLS` para o fluxo de login (rejeitada: um bug de consulta vira vazamento entre tenants); incluir o slug do tenant na URL de login (rejeitada: piora a UX e a spec define e-mail único no sistema).

## R4: Sessão

**Decisão**: **sessão opaca no servidor**. O token é aleatório de 256 bits (`crypto.randomBytes`), enviado ao cliente uma única vez e guardado no banco apenas como hash SHA-256 na tabela `sessao`.

- Expiração **deslizante** por papel, conforme FR-013: dono 12 horas, barbeiro 30 dias de inatividade. A regra de duração vive em `packages/domain` (função pura); `ultimo_uso_em` é renovado no máximo a cada 1 minuto para evitar uma escrita por requisição.
- **Web (admin)**: cookie `HttpOnly`, `Secure` (exceto em `localhost`), `SameSite=Lax`, e verificação do cabeçalho `Origin` nas requisições que alteram estado.
- **Mobile (barber)**: o mesmo token, devolvido no corpo do login quando `cliente = "mobile"`, guardado com `expo-secure-store` e enviado em `Authorization: Bearer`.
- Revogação (sair, desativar, trocar senha) = marcar `revogada_em`; vale na requisição seguinte, o que atende ao SC-004 (1 minuto) com folga.

**Racional**: revogação imediata é requisito (FR-008, FR-016). Com JWT sem estado, revogar exigiria lista de bloqueio, ou seja, voltar a consultar o servidor, sem ganho.

**Alternativas**: JWT de acesso + refresh (rejeitada: revogação e expiração por papel mais complexas); sessão em Redis (rejeitada: a sessão precisa sobreviver a reinício do Redis e ficar sob a mesma RLS e trilha de auditoria; Redis continua só como infraestrutura).

## R5: Senha

**Decisão**: **argon2id** pela biblioteca `argon2` (0.45; binários pré-compilados para Windows e Linux), com parâmetros mínimos recomendados pela OWASP (memória 19 MiB, 2 iterações, 1 de paralelismo), ajustáveis por variável de ambiente.

- **Política** (função pura em `packages/domain`): mínimo de 8 caracteres (clarificação 4), máximo de 128, e rejeição de senhas óbvias: lista embutida das senhas mais comuns, e senha igual ao e-mail ou ao nome do usuário. Sem regras de composição obrigatória.
- Quando o e-mail não existe, o login executa um hash fictício para igualar o tempo de resposta (FR-014).

**Alternativas**: bcrypt (rejeitada: argon2id é o padrão atual recomendado); scrypt nativo do Node (aceitável, mas com menos suporte de ajuste e de formato PHC).

## R6: Convite e recuperação de senha

**Decisão**: tabela única `token_acesso` com `finalidade` = `convite` | `recuperacao`.

- Token aleatório de 256 bits; no banco só o hash. Uso único (`usado_em`). Validade: **7 dias** para convite, **1 hora** para recuperação (clarificações).
- Reenviar convite invalida o anterior. Pedir nova recuperação invalida a anterior.
- O link aponta para o admin web (`{ADMIN_BASE_URL}/convite/{token}` e `/redefinir-senha/{token}`), com `Referrer-Policy: no-referrer` nessas páginas para o token não vazar.
- Aceitar convite e redefinir senha são transações únicas: marcar o token como usado, gravar a senha, ativar o usuário (convite) e revogar as demais sessões (recuperação).

## R7: Envio de e-mail

**Decisão**: porta `EmailPort` na API com um adaptador **SMTP** (`nodemailer` 10) configurado por `SMTP_URL`. Qualquer provedor com SMTP (SES, Resend, Postmark, etc.) funciona sem mudar o código. Em desenvolvimento e testes, um contêiner **Mailpit** no Docker Compose recebe os e-mails (SMTP 1025, interface 8025). Nos testes automatizados usa-se um adaptador em memória.

- **Envio depois do commit**, sem fila nesta feature. Se o envio falhar, a operação (convite criada) permanece válida, o erro é registrado (sem dado pessoal) e o dono pode **reenviar** o convite. O reenvio é idempotente do ponto de vista do usuário e é o "equivalente" ao outbox que a constitution aceita (princípio VII) para uma única mensagem de baixo risco.
- A escolha do provedor de produção fica para a feature de hospedagem; o código não depende dela.

**Alternativas**: BullMQ para os e-mails (rejeitada: Redis e filas entram quando houver jobs reais, princípio X); SDK de um provedor específico (rejeitada: acopla sem necessidade).

## R8: Bloqueio de login e limite de requisições

**Decisão**:

- **Por conta (FR-015)**: colunas `tentativas_falhas` e `bloqueado_ate` em `usuario`. A regra (5 falhas seguidas, bloqueio de 15 minutos) é função pura em `packages/domain`; login com sucesso zera o contador.
- **Resposta indistinguível (FR-014)**: durante o bloqueio, a API responde **o mesmo 401 genérico** de credenciais erradas, mesmo com a senha correta. Assim não revela se a conta existe nem se está bloqueada. A tela explica: "E-mail ou senha incorretos, ou acesso temporariamente bloqueado".
- **Por origem**: `@nestjs/throttler` 6 (armazenamento em memória) limitando `login`, `senha/esqueci`, `convites/aceitar` e `senha/redefinir` a 20 requisições por minuto por IP (padrão ajustável). Em memória basta enquanto houver uma instância da API; ao escalar horizontalmente, trocar para armazenamento no Redis (já na infraestrutura).
- O IP **não é gravado** no banco nem nos logs (princípio IX).

## R9: Provisionamento e anonimização pela equipe do produto

**Decisão**: comandos de linha de comando em `apps/api/src/cli`, executados com a conexão administrativa (`DATABASE_ADMIN_URL`) e **sem rota HTTP**. O acesso a esses comandos é o acesso à infraestrutura, o que atende FR-022 e FR-024 sem criar um papel de "administrador da plataforma" na aplicação.

- `pnpm --filter @barbearia/api cli provisionar-barbearia --nome ... --unidade ... --fuso ... --dono-nome ... --dono-email ...`
- `pnpm --filter @barbearia/api cli anonimizar-usuario --email ...`
- Usam `util.parseArgs` do Node e o contexto de aplicação do Nest, sem biblioteca nova de CLI.
- Os eventos de segurança desses comandos têm `ator_tipo = plataforma`.

**Alternativas**: endpoints protegidos por chave de API da plataforma (rejeitada: superfície de ataque e gestão de segredo sem necessidade); tela de administração da plataforma (fora do escopo da spec).

## R10: Contratos

**Decisão**: schemas **Zod 4** em `packages/contracts/src/identidade/`, usados na API (pipe de validação) e nos clientes. Um registro de rotas (`caminho`, `método`, schemas de entrada e de saída) alimenta um script que gera o documento **OpenAPI 3.1** com `z.toJSONSchema` nativo do Zod 4, atendendo ao princípio V sem biblioteca extra. Erros seguem o formato descrito em [contracts/api.md](contracts/api.md).

## R11: Autorização e contexto do tenant na API

**Decisão**: um único módulo Nest `IdentidadeModule` (bounded context "Identidade e Tenancy", princípio VI), com:

- `AuthGuard` global: resolve a sessão (cookie ou `Bearer`), carrega usuário, papel e tenant, e recusa sem sessão válida. Rotas públicas são marcadas explicitamente (`@Publica()`).
- `@Papeis('dono')` para rotas de equipe.
- `TenantDb.transacao(tenantId, fn)`: abre a transação, define `app.tenant_id` e entrega o executor à função. Serviços **só** acessam dados por ele, de modo que esquecer o contexto resulta em zero linhas (falha fechada), nunca em vazamento.

**Alternativas**: transação aberta por requisição por interceptor (rejeitada: segura conexão durante envio de e-mail e hash de senha); `nestjs-cls` (rejeitada: dependência extra sem necessidade com a transação explícita).

## R12: Regras puras em `packages/domain`

Seguindo o princípio IV (TDD estrito), as regras abaixo entram como funções puras, sem relógio nem I/O (a hora é parâmetro):

- `validarSenha(senha, { email, nome })`
- `duracaoSessao(papel)` e `calcularExpiracao(papel, agora)`
- `avaliarTentativaLogin(estado, agora)` e `registrarFalhaLogin(estado, agora)` (5 falhas, 15 minutos)
- `conviteVigente(token, agora)` e `recuperacaoVigente(token, agora)`
- `podeDesativar(usuario, donosAtivos)` (último dono ativo)
- `normalizarEmail(email)`

Não há golden test nesta feature (não há cálculo financeiro); cada regra tem testes de borda próprios.

## R13: Dados e convenções

- **Identificadores**: UUID gerado pelo banco (`gen_random_uuid()`).
- **E-mail**: normalizado (aparado e em minúsculas) na aplicação, com `CHECK (email = lower(email))` e índice único global. A unicidade global vale mesmo sob RLS. Ao convidar um e-mail já usado em **outra** barbearia, a resposta é a mesma de um e-mail usado na própria ("e-mail indisponível"), para não revelar a existência de outra barbearia.
- **Datas**: `timestamptz` (UTC). O fuso é da **unidade**, texto IANA (por exemplo `America/Sao_Paulo`), validado contra `Intl.supportedValuesOf('timeZone')`.
- **Evento de segurança**: tabela de escrita única (somente `INSERT` e `SELECT` para `app_runtime`, mais gatilho que impede `UPDATE` e `DELETE`). Não grava e-mail, nome, senha nem IP; usa apenas identificadores internos. Falhas de login para e-mail inexistente têm `tenant_id` nulo e não são visíveis a nenhuma barbearia.
- **Anonimização**: nome vira "Usuário anonimizado", e-mail vira `anonimizado-<id>@invalid` (libera o e-mail original), `senha_hash` é apagado, sessões e tokens são revogados e `situacao` passa a `anonimizado`.

## R14: Testes

- **Unitários** (`packages/domain`, `packages/contracts`): Vitest, sem banco, rodam em Linux e Windows.
- **Integração** (`apps/api`, script `test:integration`): contra o Postgres do Docker Compose, em um banco de teste criado por execução, com as migrations reais e **a mesma RLS**. Incluem a suíte de **vazamento entre tenants** (FR-019, SC-003): duas barbearias, todos os endpoints, leitura e escrita cruzadas. E-mail em adaptador em memória.
- **CI**: o job `linux` ganha a etapa `Integration test` depois de `Infra up`; o job `windows` continua sem contêineres, rodando só os testes unitários. O `pnpm test` da raiz segue sem exigir banco.

## R15: Interfaces nesta feature

Para entregar as histórias sem antecipar fases futuras (princípio X), as telas ficam no mínimo:

- **`apps/admin`**: entrar, aceitar convite, esqueci/redefinir senha, e **Equipe** (listar, convidar, reenviar convite, desativar, reativar). Primeira tela útil do painel após o login.
- **`apps/barber`**: apenas entrar e sair, com o token guardado em armazenamento seguro. Aceitar convite e redefinir senha acontecem no navegador pelos links do e-mail.
- **`apps/booking`**: sem mudanças (cliente final não tem conta).
- Provisionamento e anonimização: sem tela (R9).

## R16: Variáveis de ambiente novas

| Variável | Uso | Padrão em dev |
|---|---|---|
| `DATABASE_URL` | Conexão da API (`app_runtime`) | `postgres://app_runtime:app_runtime@localhost:5432/barbearia` |
| `DATABASE_ADMIN_URL` | Migrations e comandos da equipe do produto | `postgres://barbearia:barbearia@localhost:5432/barbearia` |
| `APP_RUNTIME_PASSWORD` | Senha do papel `app_runtime`, usada por `db:migrate` | `app_runtime` |
| `SMTP_URL` | Envio de e-mail | `smtp://localhost:1025` (Mailpit) |
| `SMTP_FROM` | Remetente | `Barbearia <nao-responder@localhost>` |
| `ADMIN_BASE_URL` | Base dos links de convite e recuperação | `http://localhost:3001` |
| `SESSION_COOKIE_SECURE` | Força `Secure` no cookie | `false` em dev |

Segredos reais nunca entram no repositório; `.env.example` traz só valores locais de exemplo.
