# Research: Fundação do repositório

Decisões técnicas da feature 001. Cada item segue o formato Decisão / Racional / Alternativas. As escolhas de base (Node, pnpm, Turborepo, Vitest, ESLint/Prettier, Docker Compose, GitHub Actions, NestJS, Next.js, Expo) vieram do pedido do plan; aqui ficam os detalhes e os pontos em que havia mais de um caminho.

## R1. Node.js e pnpm

- **Decisão**: Node.js 24 LTS, versão exata em `.nvmrc` (`24.22.1`, a LTS mais recente na implementação; o `@nestjs/schematics` 12 exige >= 24.15.0) e `engines.node: ">=24.22.1 <25"` no `package.json` da raiz, com `engine-strict=true` no `.npmrc`. pnpm 10 travado em `packageManager: "pnpm@10.x.y"` (versão exata no momento da implementação). Instalação do pnpm documentada como `npm install -g pnpm@<versão>` (ou `corepack enable`); o pnpm respeita `packageManager` e baixa a versão travada automaticamente (`manage-package-manager-versions`, padrão no pnpm 10).
- **Scripts de build de dependências**: o pnpm 10 não executa por padrão os scripts de instalação das dependências. `onlyBuiltDependencies` em `pnpm-workspace.yaml` lista as que precisam (aprovadas na implementação: `@swc/core`, `esbuild`, `unrs-resolver`); a lista final sai de `pnpm approve-builds` na primeira instalação completa (T018 e T033).
- **Racional**: Node 24 é a linha LTS ativa em out/2026 (Node 26 só vira LTS no fim de outubro). `engine-strict` faz a instalação falhar cedo com versão errada (edge case da spec). O Corepack deixou de vir com o Node a partir da 25, então o README não depende só dele.
- **Alternativas**: Volta ou `.node-version` (menos difundido no Windows); `useNodeVersion` do pnpm (acopla o runtime ao gerenciador e confunde quem roda `node` direto).

## R2. Turborepo e scripts da raiz

- **Decisão**: Turborepo 2 com as tarefas `build`, `lint`, `typecheck`, `test` (todas com cache, `dependsOn: ["^build"]` em `build` e `typecheck`) e `dev` (`persistent: true`, `cache: false`). Os scripts da raiz chamam `turbo run <tarefa>`; formatação (`prettier`) e infraestrutura (`docker compose`) rodam direto da raiz, sem turbo. Ver [contracts/commands.md](contracts/commands.md).
- **Racional**: Prettier formata o repositório inteiro (inclusive arquivos fora dos espaços), então não faz sentido por pacote. `docker compose` e `prettier` têm a mesma sintaxe em PowerShell e bash; nenhum script usa `&&`, `rm -rf`, variáveis `$VAR` ou `%VAR%`.
- **Alternativas**: Nx (mais pesado, fora da constitution); scripts `pnpm -r` sem turbo (sem cache nem grafo de dependências).

## R3. Configuração compartilhada sem pacotes extras

- **Decisão**: `tsconfig.base.json` na raiz (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `isolatedModules`, `skipLibCheck`), estendido por cada espaço. NestJS, Next.js e Expo sobrepõem só o que o framework exige (`module`/`moduleResolution`, `jsx`, `experimentalDecorators`/`emitDecoratorMetadata` na API, base `expo/tsconfig.base` no barber), mantendo os flags de rigor. Um `eslint.config.mjs` e um `prettier.config.mjs` na raiz, com dependências de lint instaladas como `devDependencies` da raiz.
- **Racional**: FR-001 exige exatamente sete espaços; pacotes `packages/tsconfig` ou `packages/eslint-config` seriam espaços a mais. O ESLint 9 resolve a flat config subindo a partir do diretório atual, então `eslint .` dentro de cada espaço encontra o arquivo da raiz.
- **Alternativas**: pacotes de config internos (padrão do template do Turborepo, mas conflita com FR-001); um arquivo de config por espaço (duplicação).

## R4. ESLint e Prettier

- **Decisão**: ESLint 9 flat config com `typescript-eslint` (preset `strictTypeChecked` em `packages/*` e `apps/api`; `recommendedTypeChecked` nos apps de UI), `eslint-config-next` (flat) para `apps/admin` e `apps/booking`, `eslint-config-expo` (flat) para `apps/barber`, e `eslint-config-prettier` por último. Em `packages/domain`, a regra `no-restricted-imports` proíbe `@nestjs/*`, `next`, `react`, `react-native`, `expo*`, `pg`, `ioredis`, `bullmq` e módulos `node:*` de I/O e tempo. Prettier 3 com `endOfLine: "lf"`. Comandos: `pnpm lint`, `pnpm format`, `pnpm format:check`.
- **Racional**: a regra do domínio transforma o princípio IV em verificação automática. A partir do Next.js 16, `next lint` foi removido, então os apps Next usam o CLI do ESLint como os demais.
- **Alternativas**: Biome (mais rápido, mas sem plugins equivalentes para Next/Expo e fora do pedido); `eslint-plugin-prettier` (mistura formatação e lint e deixa o lint mais lento).

## R5. Testes: Vitest também na API

- **Decisão**: Vitest em todos os espaços com testes. Na API, Vitest com `unplugin-swc` (para emitir metadados de decorators, que o esbuild não emite) e `supertest` para o teste do `GET /health` via `Test.createTestingModule`. `packages/contracts` e `packages/ui` com Vitest configurado e `passWithNoTests: true`. Os apps de UI não têm script `test` nesta feature, e o turbo os ignora.
- **Racional**: um único runner no monorepo significa uma sintaxe, uma configuração de cobertura e um modo watch. Quando a API importar `packages/domain` e `packages/contracts` (ESM), o Vitest os resolve nativamente, enquanto o Jest exigiria `ts-jest` mais mapeamento de módulos ESM. O custo é um plugin (`unplugin-swc`) e se afastar do template padrão do Nest CLI, que gera Jest.
- **Alternativas**: Jest, padrão do NestJS (documentação oficial direta, mas dois runners no monorepo e atrito com ESM); `node:test` (sem integração com NestJS nem ecossistema de mocks).

## R6. Esqueleto da API (NestJS)

- **Decisão**: NestJS 12 (a versão estável na implementação; o plan assumia a 11) com adaptador Express, **ESM** (`"type": "module"`, `module: NodeNext`, imports relativos com extensão `.js`), `AppModule` importando só um `HealthModule` com `GET /health` → `200 {"status":"ok"}`, conforme [contracts/health.md](contracts/health.md). Porta via `PORT` (padrão 3000). Build com `nest build` (tsc). Sem conexão com banco ou Redis.
- **Racional**: o health check atende FR-003 e dá um alvo verificável para SC-007. A partir do Nest 12 os pacotes `@nestjs/*` são somente ESM, então a API segue ESM (um projeto CommonJS não consegue importá-los). Isso também alinha a API com `packages/*`, que são ESM.
- **Alternativas**: ficar no Nest 11 com CommonJS (descartado: versão mais antiga sem ganho); Fastify (decisão sem necessidade agora); `@nestjs/terminus` (verifica dependências, mas aqui não há nenhuma).

## R7. Esqueletos web (Next.js)

- **Decisão**: Next.js 16 com App Router em `apps/admin` (porta 3001) e `apps/booking` (porta 3002), cada um com `app/layout.tsx` (viewport mobile, `lang="pt-BR"`) e `app/page.tsx` em branco como server component. Em `booking` não há `"use client"`, o que garante renderização no servidor (princípio VIII). `transpilePackages` fica preparado para `@barbearia/ui` e `@barbearia/contracts`.
- **Racional**: é o mínimo que prova `dev`, `build`, `lint` e `typecheck` com o framework real.
- **Alternativas**: Pages Router (legado); export estático para booking (violaria a renderização no servidor).

## R8. Esqueleto mobile (Expo)

- **Decisão**: Expo SDK estável mais recente com `expo-router` e uma tela vazia (`app/index.tsx`). O `dev` não entra no `pnpm dev` (FR-003a); é iniciado com `pnpm dev:barber` (`expo start`). A verificação de bundle (FR-017a) é o script `build` do barber: `expo export --platform android --platform ios --output-dir dist`, que gera só o JavaScript, sem build nativo.
- **Racional**: `expo export` roda em Linux sem Xcode ou Android SDK. O Expo suporta instalações isoladas do pnpm a partir do SDK 54. Se algum módulo nativo exigir hoisting, o fallback documentado é `node-linker=hoisted` no `.npmrc`, que vale para o workspace inteiro (risco aceito).
- **Alternativas**: EAS Build (nativo, lento, serviço externo; fora do escopo por FR-017a); React Navigation sem expo-router (mais configuração manual).

## R9. Verificação de banco e fila sem biblioteca

- **Decisão**: `docker-compose.yml` com `postgres:17-alpine` e `redis:7.4-alpine`, cada um com `healthcheck` (`pg_isready` e `redis-cli ping`), volumes nomeados e portas vindas de variáveis com padrão (`${POSTGRES_PORT:-5432}`, `${REDIS_PORT:-6379}`). `pnpm infra:up` roda `docker compose up -d --wait`, que só retorna quando os healthchecks passam. Depois disso, `pnpm infra:check` roda `scripts/infra-check.mjs`, em Node puro (`node:net`), que a partir do host:
  - envia `PING` ao Redis e espera `+PONG`;
  - envia ao Postgres um `SSLRequest` (8 bytes) e espera a resposta `S` ou `N` de 1 byte, o que confirma que há um servidor Postgres falando o protocolo na porta;
  - usa timeout e retentativa curtos e retorna código de saída ≠ 0 em falha.
- **Racional**: atende FR-017d e o pedido de não escolher biblioteca de banco. O healthcheck prova que o serviço está saudável dentro do contêiner; o script prova que a porta exposta no host responde com o protocolo certo. As variáveis vêm do `.env` (lido automaticamente pelo Compose) e o script usa `node --env-file-if-exists=.env`.
- **Alternativas**: `pg`/`ioredis` só para o teste (seria escolher biblioteca agora); `services:` do GitHub Actions (não testaria o comando documentado, o que contraria FR-017d); checagem TCP sem protocolo (não distingue um serviço qualquer escutando na porta).
- **Versões das imagens**: Postgres 17 por estabilidade; a 18 mudou o layout do volume e a hospedagem ainda não foi decidida. Redis 7.4 é compatível com BullMQ. As duas podem ser revistas no ADR de hospedagem.

## R10. Variáveis e configuração local

- **Decisão**: `.env.example` versionado com `POSTGRES_PORT`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `REDIS_PORT` e `PORT` (API). `.env` fica no `.gitignore`. Todos os valores têm padrão funcional, então o projeto roda sem `.env` (FR-015, FR-016). As portas dos apps têm padrão fixo: a API lê `PORT` (padrão 3000), carregado do `.env` da raiz pelo script `dev` quando o arquivo existe, e os apps Next ficam nos scripts (`next dev --port 3001` e `--port 3002`). Para trocar pontualmente, `pnpm --filter @barbearia/admin dev --port <n>`. Os apps web não carregam `.env` porque, nesta feature, não precisam de nenhuma variável; só a porta da API vem de lá. Inventário completo em [data-model.md](data-model.md).
- **Alternativas**: `dotenv-cli` nos scripts (dependência extra); `.env` por app (espalha configuração que hoje é só de infraestrutura).

## R11. Fins de linha e editor

- **Decisão**: `.gitattributes` com `* text=auto eol=lf` (binários marcados como `binary`), `.editorconfig` com `end_of_line = lf`, e Prettier com `endOfLine: "lf"`.
- **Racional**: atende FR-012; sem isso, um checkout no Windows com `core.autocrlf=true` faria `format:check` falhar.

## R12. CI no GitHub Actions

- **Decisão**: um workflow `.github/workflows/ci.yml` disparado em `push` (todas as branches) e `pull_request`, com dois jobs independentes ([contracts/ci.md](contracts/ci.md)):
  - **linux** (`ubuntu-latest`): install → `format:check` → `lint` → `typecheck` → `test` → `build` → `infra:up` → `infra:check` → `infra:down` (este último sempre roda, `if: always()`).
  - **windows** (`windows-latest`, shell `pwsh`): install → `format:check` → `lint` → `typecheck` → `test`. Sem build e sem contêineres, conforme o pedido do plan.
  - Setup em ambos: `pnpm/action-setup` (lê `packageManager`), `actions/setup-node` com `node-version-file: .nvmrc` e `cache: pnpm`, e `pnpm install --frozen-lockfile`. Cache local do turbo (`.turbo`) via `actions/cache`. Cada passo tem nome próprio para que a falha indique a etapa (FR-019).
- **Racional**: o repositório está no GitHub, e o Actions oferece runners Linux e Windows gratuitos para o caso de uso. Registrado em [ADR 0001](../../docs/adr/0001-ci-github-actions.md).
- **Divergência registrada**: a spec (FR-017) pedia build também em Windows. O pedido do plan define o job Windows sem build, e a spec foi ajustada para isso. `format:check` foi mantido no Windows porque é a verificação que detecta problemas de fim de linha (FR-012) e custa segundos.
- **Alternativas**: GitLab CI, CircleCI e Azure Pipelines (exigiriam outro serviço além do GitHub); Turbo remote cache (desnecessário no tamanho atual).

## R13. Engine de contêiner: Docker como padrão único

- **Decisão**: os scripts `infra:*` chamam `docker compose` diretamente. Não haverá `scripts/compose.mjs` nem a variável `CONTAINER_ENGINE`. O pré-requisito documentado é Docker (Docker Desktop no Windows, Docker Engine com Compose v2 no Linux).
- **Racional**: a spec exige paridade entre Windows e Linux (FR-009), não suporte a várias engines. O CI e o ADR 0001 já usam Docker. Um wrapper adicionaria um script e uma variável sem requisito que os peça, e a feature ficaria com um caminho (Podman) que o CI não exercita. O motivo original da proposta, um notebook Windows com apenas Podman, era restrição de máquina, não do projeto.
- **Alternativas**: `scripts/compose.mjs` com detecção de `docker` ou `podman` (descartado pelos motivos acima; pode ser reaberto se a equipe passar a usar Podman de forma recorrente); instalar o pacote `podman-docker` (Linux) ou configurar o alias do Docker CLI para quem só tem Podman, sem mudar o projeto.
