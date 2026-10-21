# Contrato: API de identidade

Contrato de referência dos endpoints desta feature. A fonte da verdade são os schemas Zod em `packages/contracts/src/identidade/`; o documento OpenAPI 3.1 é gerado a partir deles (R10). Mensagens ao usuário em português.

## Convenções

- **Formato**: JSON (`application/json`). Datas em ISO 8601 UTC.
- **Autenticação**: cookie de sessão `HttpOnly` (web) **ou** `Authorization: Bearer <token>` (mobile). Rotas marcadas como **pública** dispensam sessão. Sem sessão válida em rota protegida: `401 SESSAO_INVALIDA`.
- **Origem** (web): requisições que alteram estado com cookie exigem `Origin` igual a `ADMIN_BASE_URL`; caso contrário `403 ORIGEM_INVALIDA`.
- **Limite por origem**: rotas marcadas com ⏱ aceitam até 20 requisições por minuto por IP; acima disso `429 MUITAS_REQUISICOES` com `Retry-After`.
- **Erros** (todas as rotas):

```json
{ "codigo": "CODIGO_ESTAVEL", "mensagem": "Texto para o usuário", "campos": { "email": "E-mail inválido" } }
```

`campos` aparece só em `400 DADOS_INVALIDOS`. Códigos são estáveis; mensagens podem mudar.

- **Respostas de usuário** nunca incluem `senha_hash`, tokens guardados nem contadores de bloqueio.

```json
{ "id": "uuid", "nome": "string", "email": "string", "papel": "dono|barbeiro", "situacao": "convidado|ativo|desativado", "barbeariaId": "uuid" }
```

## Autenticação

### `POST /auth/login` ⏱ pública

Entrada: `{ "email": string, "senha": string, "cliente": "web" | "mobile" }`

| Resultado | Corpo |
|---|---|
| `200` | `{ "usuario": Usuario, "token"?: string }`. Para `web`, define o cookie de sessão e **não** devolve `token`. Para `mobile`, devolve `token` no corpo e não define cookie |
| `401 CREDENCIAIS_INVALIDAS` | "E-mail ou senha incorretos, ou acesso temporariamente bloqueado." |
| `400 DADOS_INVALIDOS` | Formato inválido |

**Indistinguibilidade (FR-014, SC-005)**: e-mail inexistente, senha errada, conta `convidado`, `desativado`, `anonimizado` e conta **bloqueada** (mesmo com a senha correta) respondem exatamente o mesmo `401`, no mesmo formato e com tempo de resposta equivalente. Cada falha de conta existente incrementa `tentativas_falhas`; a 5ª seguida define `bloqueado_ate = agora + 15 min`. Login válido zera o contador.

Eventos: `login_sucesso`, `login_falha`.

### `POST /auth/logout`

Revoga a sessão atual. `204`. Evento `logout`.

### `GET /auth/eu`

`200 { "usuario": Usuario, "barbearia": { "id", "nome", "unidades": [{ "id", "nome", "fusoHorario" }] } }`. Usado pelo cliente para saber quem está logado e em qual barbearia (e fuso da unidade).

## Convite (primeiro acesso)

### `GET /auth/convites/{token}` ⏱ pública

Permite à tela mostrar o formulário antes de pedir a senha.

| Resultado | Corpo |
|---|---|
| `200` | `{ "nome": string, "barbearia": string }` |
| `410 CONVITE_INVALIDO` | Convite expirado, usado, invalidado ou inexistente (mesma resposta para todos os casos). "Este convite não é mais válido. Peça um novo ao dono da barbearia." |

### `POST /auth/convites/aceitar` ⏱ pública

Entrada: `{ "token": string, "senha": string, "cliente": "web" | "mobile" }`

| Resultado | Efeito |
|---|---|
| `200 { usuario, token? }` | Valida o convite e a política de senha; grava o hash; `situacao = ativo`; marca o token como usado; inicia sessão (como no login). Evento `convite_aceito` |
| `410 CONVITE_INVALIDO` | Convite não vigente |
| `400 SENHA_FRACA` | `campos.senha` com o motivo (curta, comum, igual ao e-mail ou ao nome) |

## Recuperação de senha

### `POST /auth/senha/esqueci` ⏱ pública

Entrada: `{ "email": string }`. **Sempre** `202` com a mesma mensagem ("Se o e-mail estiver cadastrado, enviaremos as instruções."), exista ou não a conta, e com tempo equivalente (FR-014). Se a conta estiver `ativa`, invalida o token anterior, cria um de 1 hora e envia o e-mail após o commit. Evento `senha_recuperacao_solicitada`.

### `POST /auth/senha/redefinir` ⏱ pública

Entrada: `{ "token": string, "senha": string }`

| Resultado | Efeito |
|---|---|
| `204` | Valida o token e a política de senha; troca o hash; zera `tentativas_falhas` e `bloqueado_ate`; marca o token como usado; **revoga todas as sessões** do usuário (FR-016). Evento `senha_redefinida`. Não inicia sessão: o usuário entra em seguida |
| `410 TOKEN_INVALIDO` | Token expirado, usado, invalidado ou inexistente |
| `400 SENHA_FRACA` | Como acima |

## Equipe (papel `dono`)

Todas exigem sessão de `dono`; `barbeiro` recebe `403 SEM_PERMISSAO`. Todas operam só na barbearia da sessão; um `id` de outra barbearia responde `404 NAO_ENCONTRADO`, idêntico a um `id` inexistente (FR-018).

### `GET /equipe`

`200 { "usuarios": Usuario[] }` da própria barbearia, ordenados por nome. Inclui `convidado`, `ativo` e `desativado`; não inclui `anonimizado`.

### `POST /equipe/convites`

Entrada: `{ "nome": string, "email": string, "papel": "dono" | "barbeiro" }`

| Resultado | Efeito |
|---|---|
| `201 { usuario }` | Cria o usuário `convidado` e um convite de 7 dias; envia o e-mail após o commit. Evento `convite_enviado` |
| `409 EMAIL_INDISPONIVEL` | E-mail já usado em **qualquer** barbearia (mesma resposta nos dois casos, R13) |
| `400 DADOS_INVALIDOS` | |

### `POST /equipe/{id}/reenviar-convite`

Só para usuário `convidado`. Invalida o convite anterior, cria outro de 7 dias e reenvia. `204`. `409 USUARIO_NAO_CONVIDADO` caso contrário. Evento `convite_enviado`.

### `POST /equipe/{id}/desativar`

`204`. Usuário vira `desativado`, **todas as sessões são revogadas** e convites pendentes invalidados. `409 ULTIMO_DONO` se for o último dono ativo (inclusive o próprio usuário que chama). Evento `usuario_desativado`.

### `POST /equipe/{id}/reativar`

`204`. Se o usuário tem senha: volta a `ativo` com as mesmas credenciais. Se nunca definiu senha: volta a `convidado` e um novo convite é enviado. `409 USUARIO_NAO_DESATIVADO` caso contrário. Evento `usuario_reativado`.

## Apoio de banco

Funções `SECURITY DEFINER` (R3), usadas só pela camada de acesso a dados da API. Não são endpoints; registradas aqui como parte do contrato interno.

| Função | Colunas devolvidas |
|---|---|
| `auth_buscar_usuario_por_email(email)` | `id, tenant_id, papel, situacao, senha_hash, tentativas_falhas, bloqueado_ate` |
| `auth_buscar_sessao(token_hash)` | `sessao_id, tenant_id, usuario_id, expira_em, ultimo_uso_em, revogada_em, papel, situacao` |
| `auth_buscar_token_acesso(token_hash, finalidade)` | `id, tenant_id, usuario_id, expira_em, usado_em, invalidado_em` |

## Cobertura de requisitos

| Requisito | Onde |
|---|---|
| FR-006, FR-009 | Convites, `EMAIL_INDISPONIVEL`, convite de 7 dias |
| FR-007, FR-008 | Equipe: convidar, desativar, reativar |
| FR-010 a FR-016 | Autenticação, recuperação, limite por origem |
| FR-017, FR-018, FR-019 | `404` idêntico entre barbearias; RLS (data-model) |
| FR-020, SC-006 | Eventos citados em cada rota |
