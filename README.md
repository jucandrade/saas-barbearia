# SaaS Barbearia

Monorepo do SaaS de gestão para barbearias. Esta é a fundação do repositório: estrutura, comandos de desenvolvimento, ambiente local e integração contínua. Ainda não há regra de negócio.

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

| Comando             | O que faz                                                                                    |
| ------------------- | -------------------------------------------------------------------------------------------- |
| `pnpm install`      | Instala as dependências de todos os espaços                                                  |
| `pnpm dev`          | Sobe a API (3000), o admin (3001) e o booking (3002) em desenvolvimento                      |
| `pnpm dev:barber`   | Inicia o app do barbeiro (Metro, porta 8081)                                                 |
| `pnpm build`        | Build de produção da API, do admin e do booking, mais o bundle JavaScript do app do barbeiro |
| `pnpm test`         | Roda os testes de todos os espaços que têm testes                                            |
| `pnpm lint`         | ESLint em todos os espaços                                                                   |
| `pnpm typecheck`    | Verificação de tipos (TypeScript estrito) em todos os espaços                                |
| `pnpm format`       | Aplica a formatação do repositório                                                           |
| `pnpm format:check` | Verifica a formatação sem alterar nada                                                       |
| `pnpm infra:up`     | Sobe o Postgres e o Redis locais e espera ficarem saudáveis                                  |
| `pnpm infra:check`  | Confirma, a partir da sua máquina, que o Postgres e o Redis respondem                        |
| `pnpm infra:down`   | Para a infraestrutura, preservando os dados                                                  |
| `pnpm infra:reset`  | Para a infraestrutura e **apaga** os dados locais                                            |

A CI roda exatamente estes comandos: `format:check`, `lint`, `typecheck` e `test` em Linux e Windows, e `build` e `infra:*` também em Linux.

## Estrutura

| Espaço               | Para que serve                                                                     |
| -------------------- | ---------------------------------------------------------------------------------- |
| `apps/api`           | API em NestJS; hoje só expõe `GET /health`                                         |
| `apps/admin`         | Painel administrativo em Next.js (página em branco)                                |
| `apps/booking`       | Link público de agendamento em Next.js, renderizado no servidor (página em branco) |
| `apps/barber`        | App do barbeiro em React Native com Expo (tela vazia)                              |
| `packages/domain`    | Regras de negócio como funções puras, sem framework, banco, rede ou relógio        |
| `packages/contracts` | Contratos compartilhados entre API e clientes (vazio)                              |
| `packages/ui`        | Componentes de interface compartilhados (vazio)                                    |

## Configuração local

Portas e credenciais têm valores padrão e o projeto roda sem nenhuma configuração. Para alterar algum valor, copie [.env.example](.env.example) para `.env` (ignorado pelo git) e edite:

| Variável                                            | Padrão      | Para que serve                              |
| --------------------------------------------------- | ----------- | ------------------------------------------- |
| `POSTGRES_PORT`                                     | 5432        | Porta do Postgres no seu computador         |
| `REDIS_PORT`                                        | 6379        | Porta do Redis no seu computador            |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | `barbearia` | Credenciais locais de exemplo, não secretas |
| `PORT`                                              | 3000        | Porta da API em `pnpm dev`                  |

As portas do admin (3001) e do booking (3002) ficam nos scripts. Para trocar uma delas, rode o app sozinho: `pnpm --filter @barbearia/admin dev --port 4001`.

## Problemas comuns

**Porta ocupada.** Se `pnpm infra:up` falhar com `address already in use` ou citar a porta 5432 ou 6379, algum serviço já usa essa porta. Defina outra no `.env`, por exemplo `POSTGRES_PORT=5433`, e rode de novo. Para a API, defina `PORT`. Para admin e booking, use `--port`, como mostrado acima.

**Versão do Node incompatível.** `pnpm install` falha com `Unsupported environment` e informa a versão esperada. Instale a versão de `.nvmrc` (por exemplo, com `nvm install` ou `nvm use` na raiz).

**`OS file watch limit reached` no Linux.** O `pnpm dev` pode falhar quando o limite de arquivos observados do sistema está esgotado, o que é comum com o editor aberto sobre `node_modules`. Isso é uma configuração da máquina, não do projeto: aumente `fs.inotify.max_user_watches` (por exemplo, para 524288) e reinicie o editor.

**Docker não encontrado.** `pnpm infra:*` precisa do comando `docker` no PATH. Os demais comandos não precisam de Docker.
