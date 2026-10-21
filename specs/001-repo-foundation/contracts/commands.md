# Contrato: comandos da raiz

Todos os comandos rodam na raiz do repositório, com a **mesma sintaxe em PowerShell e bash** (FR-009). Todos retornam código de saída ≠ 0 em caso de falha (FR-010). A CI usa exatamente estes comandos (FR-018).

| Comando | Faz | Implementação | Requisitos |
|---|---|---|---|
| `pnpm install` | Instala todas as dependências; falha se o Node estiver fora de `engines` | pnpm workspaces + `engine-strict` | FR-006, FR-011 |
| `pnpm dev` | Sobe api (3000), admin (3001) e booking (3002) em modo de desenvolvimento | `turbo run dev --filter=@barbearia/api --filter=@barbearia/admin --filter=@barbearia/booking` | FR-003a, SC-007 |
| `pnpm dev:barber` | Inicia o app do barbeiro (Metro, porta 8081) | `pnpm --filter @barbearia/barber dev` → `expo start` | FR-003a |
| `pnpm test` | Roda os testes de todos os espaços que têm testes | `turbo run test` | FR-007 |
| `pnpm lint` | ESLint em todos os espaços | `turbo run lint` | FR-008 |
| `pnpm typecheck` | `tsc --noEmit` em todos os espaços | `turbo run typecheck` | FR-005, FR-008 |
| `pnpm format` | Aplica a formatação no repositório | `prettier --write .` | FR-008 |
| `pnpm format:check` | Verifica a formatação sem alterar nada | `prettier --check .` | FR-008, FR-012 |
| `pnpm build` | Build de produção de api, admin e booking, mais o bundle JS do barber | `turbo run build` | FR-017a, FR-017b |
| `pnpm infra:up` | Sobe Postgres e Redis e espera os healthchecks | `docker compose up -d --wait` | FR-013 |
| `pnpm infra:check` | Confirma, a partir do host, que Postgres e Redis respondem | `node --env-file-if-exists=.env scripts/infra-check.mjs` | FR-017d |
| `pnpm infra:down` | Para a infraestrutura preservando os dados | `docker compose down` | FR-014 |
| `pnpm infra:reset` | Para a infraestrutura e **apaga** os dados locais | `docker compose down -v` | FR-014 |

## Scripts por espaço (consumidos pelo turbo)

| Espaço | `dev` | `build` | `lint` | `typecheck` | `test` |
|---|---|---|---|---|---|
| `apps/api` | `nest start --watch` | `nest build` | ✓ | ✓ | `vitest run` |
| `apps/admin` | `next dev --port 3001` | `next build` | ✓ | ✓ | — |
| `apps/booking` | `next dev --port 3002` | `next build` | ✓ | ✓ | — |
| `apps/barber` | `expo start` | `expo export --platform android --platform ios --output-dir dist` | ✓ | ✓ | — |
| `packages/domain` | — | `tsc -p tsconfig.build.json` | ✓ | ✓ | `vitest run` |
| `packages/contracts` | — | `tsc -p tsconfig.build.json` | ✓ | ✓ | `vitest run` (`passWithNoTests`) |
| `packages/ui` | — | `tsc -p tsconfig.build.json` | ✓ | ✓ | `vitest run` (`passWithNoTests`) |

`lint` = `eslint .` e `typecheck` = `tsc --noEmit` em todos os espaços.

## Trocar portas

- Infraestrutura: definir `POSTGRES_PORT` ou `REDIS_PORT` no `.env` ([data-model.md](../data-model.md)).
- API: definir `PORT` no `.env` da raiz (copiado de `.env.example`). O script `dev` da API carrega esse arquivo se ele existir, então o procedimento é o mesmo em PowerShell e bash e não há comando com variante por sistema operacional (SC-006).
- Admin e booking, pontualmente: `pnpm --filter @barbearia/admin dev --port 4001`.
