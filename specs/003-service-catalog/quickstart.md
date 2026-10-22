# Quickstart: validação da feature 003

Roteiro para provar, de ponta a ponta, que o catálogo funciona. Rotas em [contracts/api.md](contracts/api.md) e tabelas em [data-model.md](data-model.md). Pré-requisitos: os das features 001 e 002 (Node, pnpm, Docker) e uma barbearia provisionada com dono, como no quickstart da 002.

## Cenário 1: preparar o ambiente

```
pnpm install
pnpm infra:up
pnpm db:migrate
pnpm db:migrate
pnpm dev
```

**Esperado**: o primeiro `db:migrate` aplica `0004_catalog.sql`; o segundo termina sem alterar nada. Com a API de pé, entrar como o dono provisionado na 002 (e convidar um barbeiro pela tela **Equipe**, se ainda não houver).

## Cenário 2: categorias e serviços (US1, SC-001)

1. Em `/catalog`, criar as categorias **Cabelo** e **Barba**.
2. Cadastrar três serviços: "Corte" (Cabelo, 30 min, R$ 50,00), "Barba" (Barba, 30 min, R$ 35,00) e "Corte + Barba" (Cabelo, 60 min, R$ 80,00).
3. Editar o preço de "Barba" para R$ 40,00: a lista mostra o valor novo.
4. Renomear "Cabelo" para "Cabelos" e subir "Barba" acima dela: os serviços continuam nas categorias e a ordem muda.
5. Cronometrar (SC-001): cadastrar um serviço completo leva menos de 1 minuto, e um catálogo de 15 serviços menos de 15 minutos.

**Negativos**:

| Alteração | Esperado |
|---|---|
| Nome repetido (`corte ` com espaço no fim) | "Já existe um serviço com esse nome." |
| Duração 37 ou 600 | Recusada, indicando o campo |
| Preço negativo ou acima de R$ 10.000,00 | Recusado, indicando o campo |
| Nome com mais de 80 caracteres | Recusado |
| Remover "Barba" (categoria) com serviço dentro | "Mova ou desative os serviços desta categoria antes de removê-la." |
| Barbeiro tentando criar ou editar (API) | `403 NO_PERMISSION` |

## Cenário 3: desativar e reativar (US2, SC-005)

1. Desativar "Corte + Barba": ele some das opções ativas e aparece como desativado para o dono; o barbeiro já não o vê.
2. Reativar: volta com os mesmos dados, executores e valores específicos.
3. Conferir que não existe ação de apagar serviço na tela e que `DELETE /services/{id}` não existe.
4. Com "Corte + Barba" desativado, tentar cadastrar outro serviço com esse nome: recusado (o nome continua reservado); renomear o desativado libera o nome.

## Cenário 4: executores (US3)

1. Em "Corte", vincular o dono e o barbeiro; em "Barba", só o barbeiro; "Corte + Barba" fica sem executor.
2. A lista do dono mostra "Corte + Barba" sinalizado como **sem executor**.
3. Remover o vínculo do barbeiro em "Barba": ele deixa de constar como executor.
4. Desativar o barbeiro na tela **Equipe**: ele some da lista de executores; reativar devolve o vínculo e os valores.

**Negativo**: tentar vincular um usuário desativado, com convite pendente ou de outra barbearia: recusado (`EXECUTOR_NOT_ELIGIBLE` ou `404`).

## Cenário 5: valores por executor (US4, SC-004)

1. Em "Corte", definir para o barbeiro preço R$ 60,00 e deixar a duração em branco.
2. Consultar os valores do serviço para o barbeiro: R$ 60,00 e 30 min (duração padrão). Para o dono: R$ 50,00 e 30 min.
3. Mudar o preço padrão de "Corte" para R$ 55,00: o valor do barbeiro continua R$ 60,00; o do dono passa a R$ 55,00.
4. Limpar o valor específico do barbeiro: ele volta a R$ 55,00.

## Cenário 6: consulta pelo barbeiro (US5)

1. Entrar no app do barbeiro: a tela mostra todos os serviços **ativos**, agrupados por categoria, com os dele destacados e os valores que valem para ele.
2. Sair e tentar abrir o catálogo sem sessão: acesso negado.
3. Entrar com um usuário de **outra** barbearia: nenhum serviço ou categoria da primeira aparece.
4. Medição manual (SC-006): com 100 serviços cadastrados, a lista abre em menos de 2 segundos no celular em conexão móvel comum. O teste automatizado `catalog-performance.spec.ts` mede só o lado do servidor e serve de proxy.

## Cenário 7: auditoria e isolamento (SC-002, SC-007)

```
pnpm test
pnpm test:integration
```

**Esperado**: `pnpm test` (sem banco) passa os testes de domínio e de contratos. `pnpm test:integration` passa `catalog-rls`, `catalog-leak`, os fluxos das cinco histórias, a auditoria sem dado pessoal e os testes de contrato dos 15 endpoints. Remover uma política de RLS das tabelas novas faz falhar `catalog-rls.spec.ts` (como o T089 fez na 002).

**Conferência manual da trilha**: após os cenários 2 a 5, `catalog_events` tem um registro por alteração, com autor e horário, sem nome nem e-mail em `details`.
