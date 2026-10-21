# Contrato: integração contínua

Arquivo: `.github/workflows/ci.yml`. Decisão de plataforma em [ADR 0001](../../../docs/adr/0001-ci-github-actions.md).

**Gatilhos**: `push` em qualquer branch e `pull_request`.

**Setup comum** (passos nomeados nos dois jobs):

1. `Checkout`
2. `Setup pnpm` (lê `packageManager`)
3. `Setup Node` (`node-version-file: .nvmrc`, cache do pnpm)
4. `Cache turbo` (`.turbo`)
5. `Install`: `pnpm install --frozen-lockfile`

## Job `linux` (`ubuntu-latest`)

| Passo | Comando |
|---|---|
| Format check | `pnpm format:check` |
| Lint | `pnpm lint` |
| Typecheck | `pnpm typecheck` |
| Test | `pnpm test` |
| Build | `pnpm build` |
| Infra up | `pnpm infra:up` |
| Infra check | `pnpm infra:check` |
| Infra down | `pnpm infra:down` (`if: always()`) |

## Job `windows` (`windows-latest`, `shell: pwsh`)

| Passo | Comando |
|---|---|
| Format check | `pnpm format:check` |
| Lint | `pnpm lint` |
| Typecheck | `pnpm typecheck` |
| Test | `pnpm test` |

Sem build e sem contêineres (FR-017, FR-017c).

## Garantias

- Os jobs são independentes: a falha em um não cancela o outro (`fail-fast` não se aplica, pois não há matriz).
- Cada etapa é um passo nomeado, então a falha aparece com o nome da etapa e o sistema operacional (FR-019).
- Nenhum segredo é necessário.
