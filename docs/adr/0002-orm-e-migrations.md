# ADR 0002: Drizzle ORM e drizzle-kit para acesso a dados e migrations

- **Status**: Aceito
- **Data**: 2026-10-21
- **Feature**: [002-tenant-auth](../../specs/002-tenant-auth/plan.md)

## Contexto

A constitution deixa em aberto "ORM e ferramenta de migrations" e exige um ADR antes do plan das features que dependem dessa decisão. A feature 002 é a primeira a usar banco e já precisa de:

- **Row Level Security (RLS)** no PostgreSQL como garantia de isolamento entre barbearias (princípio I), com o contexto do tenant definido por transação;
- migrations versionadas que misturam esquema gerado e **SQL escrito à mão** (políticas de RLS, funções, triggers de imutabilidade e, em features futuras, a exclusion constraint da agenda);
- TypeScript `strict` e tipos derivados do esquema, sem geração de código em etapa separada;
- funcionamento igual em Windows e Linux, sem binários nativos do ORM.

## Decisão

Usar **Drizzle ORM** (`drizzle-orm`, driver `pg` / node-postgres) para consultas e **drizzle-kit** para migrations.

- O esquema fica em TypeScript em `apps/api/src/db/schema/`, com `pgTable`, `pgPolicy` e `pgRole` declarando RLS no próprio esquema.
- Migrations são arquivos SQL versionados em `apps/api/drizzle/`. O que o `drizzle-kit generate` produz é revisado; o que ele não expressa (funções, triggers, `FORCE ROW LEVEL SECURITY`) entra como migration customizada (`generate --custom`).
- Toda consulta de negócio roda dentro de uma transação que executa `set_config('app.tenant_id', <uuid>, true)` com parâmetro (nunca por concatenação de string).
- As migrations são aplicadas pelo comando `pnpm db:migrate`, com uma conexão administrativa. A API em execução usa outra conexão, de um papel sem permissão de contornar a RLS.

## Consequências

- **Positivas**: RLS declarada junto do esquema e verificável em revisão; tipos inferidos do esquema, sem etapa de geração de cliente; escape fácil para SQL puro; sem binário nativo, o que simplifica a CI em Windows; migrations em SQL legível.
- **Negativas**: ecossistema menor que o do Prisma; o `drizzle-kit` ainda está em versão 0.x, então atualizações podem mudar o formato das migrations; parte da RLS precisa ser escrita em SQL à mão.
- **Mitigação**: versões travadas no `pnpm-lock.yaml`; testes de integração de vazamento entre tenants rodam a cada push no Linux e quebram se qualquer política faltar; o SQL gerado é sempre revisado antes do commit.

## Alternativas consideradas

- **Prisma**: sem suporte de primeira classe a RLS e a contexto por transação (exige extensões de cliente e `$transaction` interativa); gera cliente com binário/engine próprio; menos confortável para SQL customizado nas migrations.
- **Kysely + migrations em SQL**: boa opção e mais próxima do SQL, mas sem declaração de esquema nem tipos derivados do esquema; os tipos precisariam de geração separada.
- **TypeORM**: decorators e `synchronize` convidam a esquema implícito; migrations menos previsíveis; suporte a RLS apenas por SQL manual.
- **SQL puro com `pg` e um executor de migrations**: máximo controle, mas sem tipagem das consultas, o que contraria o `strict` do monorepo.

## Fora deste ADR

Hospedagem, CD (deploy), observabilidade e gateway de pagamento continuam como decisões abertas da constitution.
