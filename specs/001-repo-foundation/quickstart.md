# Quickstart de validação: Fundação do repositório

Roteiro para provar, ponta a ponta, que a feature 001 cumpre a spec. Rode cada bloco em **Windows (PowerShell)** e em **Linux (bash)**: os comandos são idênticos. Lista completa de comandos em [contracts/commands.md](contracts/commands.md).

## Pré-requisitos

- Git
- Node.js na versão de `.nvmrc` (24 LTS)
- pnpm na versão de `packageManager` (`npm install -g pnpm@<versão>` ou `corepack enable`)
- Docker Desktop (Windows) ou Docker Engine com Compose v2 (Linux), apenas para os cenários 3 e 6

## Cenário 1: clonar, instalar e testar (US1, SC-001, SC-002)

```
git clone https://github.com/jucandrade/saas-barbearia.git
cd saas-barbearia
pnpm install
pnpm test
```

**Esperado**: a instalação termina sem erro; `pnpm test` executa o teste de exemplo de `@barbearia/domain` e o teste de health de `@barbearia/api`, ambos aprovados; `contracts` e `ui` passam sem testes. Não é preciso Docker.

## Cenário 2: verificações locais (US4)

```
pnpm format:check
pnpm lint
pnpm typecheck
pnpm build
```

**Esperado**: todos terminam com código 0. `pnpm build` gera `apps/api/dist`, `apps/admin/.next`, `apps/booking/.next` e `apps/barber/dist`.

**Negativos** (desfazer depois de cada um):

| Alteração proposital | Comando | Esperado |
|---|---|---|
| Adicionar espaços extras num `.ts` | `pnpm format:check` → `pnpm format` | O primeiro falha apontando o arquivo; o segundo corrige |
| `const x: number = "a"` em `packages/domain/src/index.ts` | `pnpm typecheck` | Falha com arquivo e linha |
| `import "@nestjs/common"` em `packages/domain` | `pnpm lint` | Falha pela regra de pureza do domínio |
| `expect(1).toBe(2)` no teste de exemplo | `pnpm test` | Falha, com código de saída ≠ 0 |

## Cenário 3: infraestrutura local (US3, SC-003)

```
pnpm infra:up
pnpm infra:check
pnpm infra:up
pnpm infra:down
pnpm infra:up
pnpm infra:reset
```

**Esperado**:

- `infra:up` retorna quando Postgres (5432) e Redis (6379) estão saudáveis.
- `infra:check` informa que os dois responderam.
- O segundo `infra:up` conclui sem erro e sem duplicar contêineres.
- `infra:down` para os serviços e mantém os volumes; o `infra:up` seguinte reaproveita os dados.
- `infra:reset` remove contêineres e volumes.

**Negativo**: com outro processo ocupando a porta 5432, `infra:up` falha citando a porta; definir `POSTGRES_PORT=5433` em `.env` (copiado de `.env.example`) resolve.

## Cenário 4: apps em desenvolvimento (SC-007)

```
pnpm dev
```

**Esperado**, em até 2 minutos:

- `http://localhost:3000/health` responde `200 {"status":"ok"}` ([contracts/health.md](contracts/health.md));
- `http://localhost:3001` (admin) e `http://localhost:3002` (booking) carregam uma página em branco sem erros no console;
- o código-fonte de booking (Ver código-fonte) já vem renderizado do servidor.

```
pnpm dev:barber
```

**Esperado**: o Metro sobe na porta 8081 e o app abre uma tela vazia no Expo Go ou no navegador do QR code, sem erro.

## Cenário 5: fins de linha (FR-012)

No Windows, com `git config core.autocrlf true`, clonar de novo e rodar `pnpm format:check`.

**Esperado**: passa, porque o `.gitattributes` força LF.

## Cenário 6: integração contínua (US2, SC-004, SC-005)

1. Fazer push de um commit válido: os jobs `linux` e `windows` passam, cada um em até 10 minutos.
2. Fazer push de cada alteração negativa do cenário 2 em uma branch descartável: o job correspondente falha no passo com o nome da etapa.
3. Fazer push de uma alteração que quebre o `docker-compose.yml` (por exemplo, uma imagem inexistente): só o job `linux` falha, no passo `Infra up`.

Contrato da pipeline em [contracts/ci.md](contracts/ci.md).

## Cenário 7: README (US5)

Uma pessoa sem contexto segue só o `README.md` e completa os cenários 1, 3 e 4 sem ajuda.
