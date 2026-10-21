# Quickstart: validação da feature 002

Roteiro para provar, de ponta a ponta, que a feature funciona. Detalhes de rotas em [contracts/api.md](contracts/api.md), de comandos em [contracts/commands.md](contracts/commands.md) e de tabelas em [data-model.md](data-model.md). Pré-requisitos: os da feature 001 (Node, pnpm, Docker).

## Cenário 1: preparar o ambiente (SC-001)

```
pnpm install
pnpm infra:up
pnpm db:migrate
pnpm db:migrate
pnpm dev
```

**Esperado**: `infra:up` sobe Postgres, Redis e Mailpit (`http://localhost:8025`); o primeiro `db:migrate` aplica as migrations e o segundo termina sem alterar nada; `pnpm dev` sobe api, admin e booking como na 001.

## Cenário 2: provisionar a barbearia e entrar como dono (US1, SC-001, SC-002)

```
pnpm --filter @barbearia/api cli provision-barbershop --name "Barbershop Pilot" --unit "Main" --timezone "America/Sao_Paulo" --owner-name "Dona Ana" --owner-email "ana@example.com"
```

1. O comando termina com código 0 e imprime só o id da barbearia.
2. No Mailpit chega o convite para `ana@example.com` com o link `http://localhost:3001/invitation/<token>`.
3. Abrir o link no admin, definir a senha e concluir: o usuário entra e vê a tela **Equipe** com ela mesma.
4. Sair e entrar de novo com e-mail e senha em menos de 30 segundos.

**Negativos**:

| Alteração | Esperado |
|---|---|
| Repetir o comando com o mesmo e-mail | Falha com "E-mail indisponível"; nada novo criado |
| `--timezone "Mars/Olympus"` | Falha por fuso inexistente; nada criado |
| Usar o link do convite uma segunda vez | "Este convite não é mais válido" |
| Convite do dono expirado (ou e-mail digitado errado) | `cli resend-owner-invitation --email ...` (com `--new-email` se for o caso) gera um convite novo; o link antigo deixa de valer |
| Definir a senha `12345678` ou `abc` | Recusada com o motivo (comum / curta) |

## Cenário 3: entrar, sair e bloqueio (US2, SC-005)

1. Login correto: sessão iniciada; `GET /auth/eu` devolve usuário e barbearia.
2. Sair: o mesmo cookie passa a receber `401 INVALID_SESSION`.
3. Errar a senha 5 vezes seguidas: a 6ª tentativa **com a senha correta** ainda responde `401` genérico, idêntico ao de senha errada, durante 15 minutos.
4. Comparar as respostas de e-mail inexistente, senha errada e conta bloqueada: mesmo status, mesmo corpo, tempos equivalentes.
5. Mais de 20 tentativas de login em um minuto, do mesmo IP: `429` com `Retry-After`.

## Cenário 4: equipe e papéis (US4, SC-004, SC-007)

1. Como dono, convidar `bia@example.com` como barbeiro; o convite chega ao Mailpit; Bia define a senha e entra em menos de 5 minutos.
2. Como Bia: `POST /team/invitations` e `POST /team/{id}/deactivate` respondem `403 NO_PERMISSION`.
3. Como dona, convidar um segundo dono e aceitar o convite; o papel dele não pode ser alterado.
4. Como dona, desativar Bia **com a sessão dela aberta**: em até 1 minuto a sessão de Bia responde `401` e o login é recusado.
5. Reativar Bia: ela entra com a mesma senha.
6. Tentar desativar o único dono ativo: `409 LAST_OWNER`.
7. Reenviar convite a um `invited`: o link antigo deixa de valer e o novo funciona.

## Cenário 5: recuperar a senha (US5)

1. Solicitar a recuperação para `ana@example.com` e para um e-mail inexistente: mesma resposta `202`, mesmo texto.
2. Só o e-mail existente chega ao Mailpit; usar o link, definir nova senha.
3. A senha antiga não funciona; a nova funciona.
4. Qualquer sessão aberta de Ana, em outro dispositivo, passa a responder `401`.
5. Reusar o link, ou usar um link com mais de 1 hora: recusado.

## Cenário 6: isolamento entre barbearias (US3, SC-003)

1. Provisionar uma segunda barbearia ("Barbearia B", dono `bruno@example.com`).
2. Autenticado como Ana (A), chamar `GET /team`: só aparecem usuários de A.
3. Com o `id` de um usuário de B, chamar `deactivate`, `reactivate` e `resend-invitation`: todas respondem `404 NOT_FOUND`, igual a um id inexistente.
4. Convidar, na barbearia A, o e-mail do Bruno: `409 EMAIL_UNAVAILABLE`, igual ao de um e-mail de A.
5. Automatizado: `pnpm test:integration` executa a suíte de vazamento entre tenants (todas as rotas, leitura e escrita cruzadas) e deve passar com 100% de negativas.

## Cenário 7: anonimização (FR-024, SC-008)

```
pnpm --filter @barbearia/api cli anonymize-user --email "bia@example.com"
```

1. Com Bia ainda ativa: o comando recusa e pede para desativar antes.
2. Desativar Bia e repetir: sucesso. Repetir de novo: termina sem erro.
3. O e-mail `bia@example.com` fica livre: pode ser convidado de novo.
4. Nome e e-mail originais não aparecem em nenhuma resposta da API, na tabela de usuários nem nos eventos de segurança, e os eventos anteriores de Bia seguem na trilha, ligados só ao id.
5. Tentar anonimizar o único dono ativo: recusado.

## Cenário 8: trilha de auditoria (SC-006)

Depois dos cenários acima, a tabela `security_events` contém, com autor e horário, ao menos um evento de cada tipo: `barbershop_provisioned`, `invitation_sent`, `invitation_accepted`, `login_success`, `login_failure`, `logout`, `password_recovery_requested`, `password_reset`, `user_deactivated`, `user_reactivated`, `user_anonymized`. Tentar `UPDATE` ou `DELETE` nela, mesmo como dono do esquema, falha. Nenhum registro contém e-mail, nome, senha, token ou IP.

## Cenário 9: CI (continuidade do SC-004 da 001)

1. Push válido: `linux` (incluindo `Migrate` e `Integration test`) e `windows` passam.
2. Remover uma política de RLS numa branch descartável: só `Integration test` falha, só em `linux`, apontando o vazamento.
