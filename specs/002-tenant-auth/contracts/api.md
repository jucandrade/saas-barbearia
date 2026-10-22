# Contrato: API de identidade

Contrato de referência dos endpoints desta feature. A fonte da verdade são os schemas Zod em `packages/contracts/src/identity/`; o documento OpenAPI 3.1 é gerado a partir deles (R10). Mensagens ao usuário em português.

## Convenções

- **Formato**: JSON (`application/json`). Datas em ISO 8601 UTC.
- **Autenticação**: cookie de sessão `HttpOnly` (web) **ou** `Authorization: Bearer <token>` (mobile). Rotas marcadas como **pública** dispensam sessão. Sem sessão válida em rota protegida: `401 INVALID_SESSION`.
- **Origem** (web): requisições que alteram estado com cookie exigem `Origin` igual a `ADMIN_BASE_URL`; caso contrário `403 INVALID_ORIGIN`.
- **Limite por origem**: rotas marcadas com ⏱ aceitam até 20 requisições por minuto por IP; acima disso `429 TOO_MANY_REQUESTS` com `Retry-After`.
- **Erros** (todas as rotas):

```json
{ "codigo": "CODIGO_ESTAVEL", "mensagem": "Texto para o usuário", "campos": { "email": "E-mail inválido" } }
```

`fields` aparece só em `400 INVALID_DATA`. Códigos são estáveis; mensagens podem mudar.

- **Respostas de usuário** nunca incluem `password_hash`, tokens guardados nem contadores de bloqueio.

```json
{ "id": "uuid", "name": "string", "email": "string", "role": "owner|barber", "status": "invited|active|deactivated", "barbershopId": "uuid" }
```

## Autenticação

### `POST /auth/login` ⏱ pública

Entrada: `{ "email": string, "password": string, "client": "web" | "mobile" }`

| Resultado | Corpo |
|---|---|
| `200` | `{ "user": User, "token"?: string }`. Para `web`, define o cookie de sessão e **não** devolve `token`. Para `mobile`, devolve `token` no corpo e não define cookie |
| `401 INVALID_CREDENTIALS` | "E-mail ou senha incorretos, ou acesso temporariamente bloqueado." |
| `400 INVALID_DATA` | Formato inválido |

**Indistinguibilidade (FR-014, SC-005)**: e-mail inexistente, senha errada, conta `invited`, `deactivated`, `anonymized` e conta **bloqueada** (mesmo com a senha correta) respondem exatamente o mesmo `401`, no mesmo formato e com tempo de resposta equivalente. Cada falha de conta existente incrementa `failed_attempts`; a 5ª seguida define `locked_until = now + 15 min`. Login válido zera o contador.

Eventos: `login_success`, `login_failure`.

### `POST /auth/logout`

Revoga a sessão atual. `204`. Evento `logout`.

### `GET /auth/eu`

`200 { "user": User, "barbershop": { "id", "name", "units": [{ "id", "name", "timezone" }] } }`. Usado pelo cliente para saber quem está logado e em qual barbearia (e fuso da unidade).

## Convite (primeiro acesso)

### `GET /auth/invitations/{token}` ⏱ pública

Permite à tela mostrar o formulário antes de pedir a senha.

| Resultado | Corpo |
|---|---|
| `200` | `{ "name": string, "barbershop": string }` |
| `410 INVALID_INVITATION` | Convite expirado, usado, invalidado ou inexistente (mesma resposta para todos os casos). "Este convite não é mais válido. Peça um novo ao dono da barbearia." |

### `POST /auth/invitations/accept` ⏱ pública

Entrada: `{ "token": string, "password": string, "client": "web" | "mobile" }`

| Resultado | Efeito |
|---|---|
| `200 { user, token? }` | Valida o convite e a política de senha; grava o hash; `status = active`; marca o token como usado; inicia sessão (como no login). Evento `invitation_accepted` |
| `410 INVALID_INVITATION` | Convite não vigente |
| `400 WEAK_PASSWORD` | `fields.password` com o motivo (curta, comum, igual ao e-mail ou ao nome) |

## Recuperação de senha

### `POST /auth/password/forgot` ⏱ pública

Entrada: `{ "email": string }`. **Sempre** `202` com a mesma mensagem ("Se o e-mail estiver cadastrado, enviaremos as instruções."), exista ou não a conta, e com tempo equivalente (FR-014). Se a conta estiver `active`, invalida o token anterior, cria um de 1 hora e envia o e-mail após o commit. Evento `password_recovery_requested`.

### `POST /auth/password/reset` ⏱ pública

Entrada: `{ "token": string, "password": string }`

| Resultado | Efeito |
|---|---|
| `204` | Valida o token e a política de senha; troca o hash; zera `failed_attempts` e `locked_until`; marca o token como usado; **revoga todas as sessões** do usuário (FR-016). Evento `password_reset`. Não inicia sessão: o usuário entra em seguida |
| `410 INVALID_TOKEN` | Token expirado, usado, invalidado ou inexistente |
| `400 WEAK_PASSWORD` | Como acima |

## Equipe (papel `owner`)

Todas exigem sessão de `owner`; `barber` recebe `403 NO_PERMISSION`. Todas operam só na barbearia da sessão; um `id` de outra barbearia responde `404 NOT_FOUND`, idêntico a um `id` inexistente (FR-018).

### `GET /team`

`200 { "users": User[] }` da própria barbearia, ordenados por nome. Inclui `invited`, `active` e `deactivated`; não inclui `anonymized`.

### `POST /team/invitations`

Entrada: `{ "name": string, "email": string, "role": "owner" | "barber" }`

| Resultado | Efeito |
|---|---|
| `201 { user, invitationSent }` | Cria o usuário `invited` e um convite de 7 dias; envia o e-mail após o commit. `invitationSent` é `false` se o envio falhou (o convite existe; use "Reenviar convite"). Evento `invitation_sent` |
| `409 EMAIL_UNAVAILABLE` | E-mail já usado em **qualquer** barbearia (mesma resposta nos dois casos, R13) |
| `400 INVALID_DATA` | |

### `POST /team/{id}/resend-invitation`

Só para usuário `invited`. Invalida o convite anterior, cria outro de 7 dias e reenvia. `200 { "invitationSent": boolean }`. `409 USER_NOT_INVITED` caso contrário. Evento `invitation_sent`.

### `POST /team/{id}/deactivate`

`204`. Usuário vira `deactivated`, **todas as sessões são revogadas** e convites pendentes invalidados. `409 LAST_OWNER` se for o último dono ativo (inclusive o próprio usuário que chama). Evento `user_deactivated`.

### `POST /team/{id}/reactivate`

`204`. Se o usuário tem senha: volta a `active` com as mesmas credenciais. Se nunca definiu senha: volta a `invited` e um novo convite é enviado. `409 USER_NOT_DEACTIVATED` caso contrário. Evento `user_reactivated`.

## Apoio de banco

Funções `SECURITY DEFINER` (R3), usadas só pela camada de acesso a dados da API. Não são endpoints; registradas aqui como parte do contrato interno.

| Função | Colunas devolvidas |
|---|---|
| `auth_find_user_by_email(email)` | `id, tenant_id, role, status, password_hash, failed_attempts, locked_until` |
| `auth_find_session(token_hash)` | `session_id, tenant_id, user_id, expires_at, last_used_at, revoked_at, role, status` |
| `auth_find_access_token(token_hash, purpose)` | `id, tenant_id, user_id, expires_at, used_at, invalidated_at` |

## Cobertura de requisitos

| Requisito | Onde |
|---|---|
| FR-006, FR-009 | Convites, `EMAIL_UNAVAILABLE`, convite de 7 dias |
| FR-007, FR-008 | Equipe: convidar, desativar, reativar |
| FR-010 a FR-016 | Autenticação, recuperação, limite por origem |
| FR-017, FR-018, FR-019 | `404` idêntico entre barbearias; RLS (data-model) |
| FR-020, SC-006 | Eventos citados em cada rota |
