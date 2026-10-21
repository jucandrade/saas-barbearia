# Data Model: Fundação do repositório

Esta feature **não tem entidades de negócio** e não cria esquemas, tabelas nem filas (FR-003). Banco e fila sobem vazios.

O único "modelo" é a configuração local, que define como os serviços e apps são encontrados.

## Variáveis de configuração local

Definidas em `.env.example` (versionado). Cópia opcional para `.env` (ignorado pelo git). Todas têm padrão funcional, então o projeto roda sem `.env` (FR-015).

| Variável | Padrão | Usada por | Descrição |
|---|---|---|---|
| `POSTGRES_PORT` | `5432` | `docker-compose.yml`, `scripts/infra-check.mjs` | Porta do Postgres exposta no host |
| `POSTGRES_USER` | `barbearia` | `docker-compose.yml` | Usuário local (credencial de exemplo, não secreta) |
| `POSTGRES_PASSWORD` | `barbearia` | `docker-compose.yml` | Senha local (credencial de exemplo, não secreta) |
| `POSTGRES_DB` | `barbearia` | `docker-compose.yml` | Banco criado na primeira subida |
| `REDIS_PORT` | `6379` | `docker-compose.yml`, `scripts/infra-check.mjs` | Porta do Redis exposta no host |

**Regras**:

- Nenhum valor real de produção ou segredo entra em arquivo versionado (FR-016).
- Portas dos apps têm padrão fixo: api `3000` (sobrescrevível pela variável de processo `PORT`), admin `3001`, booking `3002`, Metro (Expo) `8081`. Para trocar, veja [contracts/commands.md](contracts/commands.md).

## Volumes locais

| Volume | Conteúdo | Ciclo de vida |
|---|---|---|
| `postgres-data` | Dados do Postgres local | Preservado por `pnpm infra:down`; apagado só por `pnpm infra:reset` (FR-014) |
| `redis-data` | Persistência do Redis local | Idem |
