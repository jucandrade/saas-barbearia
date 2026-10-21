# Contrato: comandos novos

Mesma regra da [feature 001](../../001-repo-foundation/contracts/commands.md): sintaxe idêntica em PowerShell e bash, código de saída ≠ 0 em caso de falha, sem script dependente de shell.

## Comandos da raiz

| Comando | Faz | Observações |
|---|---|---|
| `pnpm db:migrate` | Garante o papel `app_runtime` (idempotente, senha de `APP_RUNTIME_PASSWORD`) e aplica as migrations pendentes com `DATABASE_ADMIN_URL` | Exige a infraestrutura de pé. Rodar duas vezes não altera nada |
| `pnpm test:integration` | Roda os testes de integração da API contra o Postgres local, num banco de teste próprio, com as migrations reais | Exige `pnpm infra:up`. Não roda no job `windows` da CI. Fora do `pnpm test` |
| `pnpm infra:up` | (existente) Passa a subir também o Mailpit | Interface em `http://localhost:8025` |

O `pnpm test` da raiz **continua sem exigir banco** e passa em Windows e Linux.

## Comandos da equipe do produto

Executados na máquina com acesso à infraestrutura (usam `DATABASE_ADMIN_URL`). Não existe rota HTTP equivalente (FR-022).

### `provisionar-barbearia`

```
pnpm --filter @barbearia/api cli provisionar-barbearia \
  --nome "Barbearia Exemplo" \
  --unidade "Matriz" \
  --fuso "America/Sao_Paulo" \
  --dono-nome "Fulano de Tal" \
  --dono-email "fulano@exemplo.com"
```

- Cria barbearia, unidade inicial e o usuário dono `convidado`, numa **única transação**; qualquer falha não deixa nada criado.
- Envia o convite (validade de 7 dias) e imprime o identificador da barbearia. **Não imprime o token nem o link.**
- Recusa e-mail já usado (`E-mail indisponível`, saída ≠ 0) e fuso inexistente.
- Evento `barbearia_provisionada` com `ator_tipo = plataforma`.

### `anonimizar-usuario`

```
pnpm --filter @barbearia/api cli anonimizar-usuario --email "fulano@exemplo.com"
```

- Exige que o usuário esteja `desativado` (recusa caso contrário, com mensagem pedindo para desativar antes).
- Recusa o último dono ativo da barbearia.
- Anonimiza nome e e-mail, apaga o hash de senha, revoga sessões e tokens, define `situacao = anonimizado`. Idempotente: repetir em um usuário já anonimizado termina sem erro.
- Evento `usuario_anonimizado` com `ator_tipo = plataforma`.
- A saída identifica o usuário só pelo `id`, nunca pelo e-mail.

## Variáveis de ambiente

Ver a tabela em [research.md, R16](../research.md#r16-variáveis-de-ambiente-novas). Todas têm padrão para desenvolvimento local; `.env.example` é atualizado.

## Mudança na CI

O job `linux` ganha duas etapas, depois de `Infra up`:

| Etapa | Comando |
|---|---|
| `Migrate` | `pnpm db:migrate` |
| `Integration test` | `pnpm test:integration` |

O job `windows` não muda.
