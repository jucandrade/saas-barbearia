# SaaS Barbearia

Monorepo do SaaS de gestão para barbearias. Além da fundação (estrutura, comandos, ambiente local e integração contínua), já existe a primeira funcionalidade: **identidade e acesso** (barbearias como tenants, donos e barbeiros, login e recuperação de senha). Ainda não há agenda, comanda nem regra financeira.

Os comandos abaixo são os mesmos no Windows (PowerShell) e no Linux.

## Pré-requisitos

| Ferramenta | Versão                                                           | Observação                                                    |
| ---------- | ---------------------------------------------------------------- | ------------------------------------------------------------- |
| Git        | qualquer recente                                                 |                                                               |
| Node.js    | a de [.nvmrc](.nvmrc) (24.22.1)                                  | A instalação falha cedo se a versão estiver fora de `engines` |
| pnpm       | a de `packageManager` em [package.json](package.json) (10.34.7)  | `npm install -g pnpm@10.34.7` ou `corepack enable`            |
| Docker     | Docker Desktop (Windows) ou Docker Engine com Compose v2 (Linux) | Só para os comandos `infra:*`                                 |

Quem usa Podman precisa expor o comando `docker` (no Linux, o pacote `podman-docker`). O projeto só suporta Docker.

## Começando

```
git clone https://github.com/jucandrade/saas-barbearia.git
cd saas-barbearia
pnpm install
pnpm test
```

Dois comandos depois do clone, sem Docker.

## Comandos

Todos rodam na raiz do repositório e retornam código de saída diferente de zero em caso de falha.

| Comando                 | O que faz                                                                                    |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| `pnpm install`          | Instala as dependências de todos os espaços                                                  |
| `pnpm dev`              | Sobe a API (3000), o admin (3001) e o booking (3002) em desenvolvimento                      |
| `pnpm dev:barber`       | Inicia o app do barbeiro (Metro, porta 8081)                                                 |
| `pnpm build`            | Build de produção da API, do admin e do booking, mais o bundle JavaScript do app do barbeiro |
| `pnpm test`             | Roda os testes de todos os espaços que têm testes (não precisa de banco)                     |
| `pnpm test:integration` | Roda os testes de integração da API contra o Postgres local (precisa de `infra:up`)          |
| `pnpm db:migrate`       | Cria os papéis do banco e aplica as migrations pendentes (rodar de novo não altera nada)     |
| `pnpm lint`             | ESLint em todos os espaços                                                                   |
| `pnpm typecheck`        | Verificação de tipos (TypeScript estrito) em todos os espaços                                |
| `pnpm format`           | Aplica a formatação do repositório                                                           |
| `pnpm format:check`     | Verifica a formatação sem alterar nada                                                       |
| `pnpm infra:up`         | Sobe o Postgres, o Redis e o Mailpit locais e espera ficarem saudáveis                       |
| `pnpm infra:check`      | Confirma, a partir da sua máquina, que o Postgres e o Redis respondem                        |
| `pnpm infra:down`       | Para a infraestrutura, preservando os dados                                                  |
| `pnpm infra:reset`      | Para a infraestrutura e **apaga** os dados locais                                            |

A CI roda exatamente estes comandos: `format:check`, `lint`, `typecheck` e `test` em Linux e Windows, e `build`, `infra:*`, `db:migrate` e `test:integration` também em Linux.

## Estrutura

| Espaço               | Para que serve                                                                      |
| -------------------- | ----------------------------------------------------------------------------------- |
| `apps/api`           | API em NestJS: identidade e acesso, banco com RLS, comandos da equipe do produto    |
| `apps/admin`         | Painel administrativo em Next.js: entrar, convite, recuperar senha e Equipe         |
| `apps/booking`       | Link público de agendamento em Next.js, renderizado no servidor (página em branco)  |
| `apps/barber`        | App do barbeiro em React Native com Expo: entrar e sair                             |
| `packages/domain`    | Regras de negócio como funções puras, sem framework, banco, rede ou relógio         |
| `packages/contracts` | Contratos (schemas Zod) compartilhados entre API e clientes, e o gerador do OpenAPI |
| `packages/ui`        | Componentes de interface compartilhados (vazio)                                     |

## Configuração local

Portas e credenciais têm valores padrão e o projeto roda sem nenhuma configuração. Para alterar algum valor, copie [.env.example](.env.example) para `.env` (ignorado pelo git) e edite:

| Variável                                            | Padrão                    | Para que serve                                 |
| --------------------------------------------------- | ------------------------- | ---------------------------------------------- |
| `POSTGRES_PORT`                                     | 5432                      | Porta do Postgres no seu computador            |
| `REDIS_PORT`                                        | 6379                      | Porta do Redis no seu computador               |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | `barbearia`               | Credenciais locais de exemplo, não secretas    |
| `PORT`                                              | 3000                      | Porta da API em `pnpm dev`                     |
| `MAILPIT_SMTP_PORT`, `MAILPIT_UI_PORT`              | 1025, 8025                | Portas do Mailpit (e-mails de desenvolvimento) |
| `SMTP_URL`, `SMTP_FROM`                             | Mailpit                   | Envio de e-mail (qualquer provedor SMTP)       |
| `ADMIN_BASE_URL`                                    | `http://localhost:3001`   | Base dos links de convite e de recuperação     |
| `DATABASE_URL`, `DATABASE_ADMIN_URL`                | derivadas de `POSTGRES_*` | Conexões da API e da migração/comandos         |

As portas do admin (3001) e do booking (3002) ficam nos scripts. Para trocar uma delas, rode o app sozinho: `pnpm --filter @barbearia/admin dev --port 4001`.

## Identidade e acesso

A API usa dois papéis no Postgres: `app_runtime` (a API, sem poder contornar a RLS) e o dono das tabelas (migrations e comandos da equipe do produto). Depois de `pnpm infra:up`, rode `pnpm db:migrate`.

Não existe cadastro público de barbearia. A equipe do produto provisiona e o dono recebe um convite por e-mail (em desenvolvimento, abra o Mailpit em http://localhost:8025):

```
pnpm --filter @barbearia/api cli provision-barbershop --name "Barbearia Piloto" --unit "Matriz" --timezone "America/Sao_Paulo" --owner-name "Dona Ana" --owner-email "ana@exemplo.com"
pnpm --filter @barbearia/api cli resend-owner-invitation --email "ana@exemplo.com"
pnpm --filter @barbearia/api cli anonymize-user --email "bia@exemplo.com"
```

`resend-owner-invitation` reenvia (ou corrige o e-mail, com `--new-email`) o convite do primeiro dono enquanto ele não foi aceito. `anonymize-user` atende a um pedido de exclusão de dados (LGPD) e exige que a pessoa já esteja desativada. Os comandos não imprimem token, link nem e-mail.

O documento OpenAPI da API sai de `pnpm --filter @barbearia/contracts openapi` (arquivo `packages/contracts/dist/openapi.json`).

Em produção, os papéis do banco devem ser criados antes (ver [migrate.ts](apps/api/src/db/migrate.ts)) e `SESSION_COOKIE_SECURE=true`.

## Problemas comuns

**Porta ocupada.** Se `pnpm infra:up` falhar com `address already in use` ou citar a porta 5432 ou 6379, algum serviço já usa essa porta. Defina outra no `.env`, por exemplo `POSTGRES_PORT=5433`, e rode de novo. Para a API, defina `PORT`. Para admin e booking, use `--port`, como mostrado acima.

**Versão do Node incompatível.** `pnpm install` falha com `Unsupported environment` e informa a versão esperada. Instale a versão de `.nvmrc` (por exemplo, com `nvm install` ou `nvm use` na raiz).

**`OS file watch limit reached` no Linux.** O `pnpm dev` pode falhar quando o limite de arquivos observados do sistema está esgotado, o que é comum com o editor aberto sobre `node_modules`. Isso é uma configuração da máquina, não do projeto: aumente `fs.inotify.max_user_watches` (por exemplo, para 524288) e reinicie o editor.

**Docker não encontrado.** `pnpm infra:*` precisa do comando `docker` no PATH. Os demais comandos não precisam de Docker.
