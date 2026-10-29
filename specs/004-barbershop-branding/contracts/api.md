# Contrato: API da identidade visual

Contrato de referência dos endpoints desta feature. A fonte da verdade são os schemas Zod em `packages/contracts/src/branding/`; o OpenAPI 3.1 é gerado deles ([research R11](../research.md#r11-contratos-e-registro-de-rotas)). Mensagens ao usuário em português. Convenções gerais (JSON, sessão por cookie ou `Bearer`, verificação de `Origin`, formato de erro, datas ISO 8601 UTC) são as de [../../002-tenant-auth/contracts/api.md](../../002-tenant-auth/contracts/api.md). As rotas de equipe e catálogo que o app do dono usa (R14) já existem nas features 002 e 003 e **não mudam**.

## Convenções

- **Acesso**: `public` = sem login; `session` = qualquer usuário autenticado (dono ou barbeiro); `owner` = só dono. Sem sessão em rota `session` ou `owner`: `401 INVALID_SESSION`. Barbeiro em rota `owner`: `403 NO_PERMISSION`.
- **Tenant**: o `tenant_id` sai da sessão, nunca do corpo. Nas rotas públicas, a barbearia é identificada só pelo `slug` do link.
- **Erro**: `{ "code": "STABLE_CODE", "message": "Texto para o usuário", "fields": { "name": "..." } }`. `fields` só aparece em `400 INVALID_DATA`.
- **Novos códigos**: `LOGO_TOO_LARGE` (413), `LOGO_UNSUPPORTED_FORMAT` (400), `LOGO_INVALID_DIMENSIONS` (400), `LOGO_CONTENT_MISMATCH` (400).
- **Atualização**: vale a última escrita (sem controle otimista); cada alteração gera um evento de auditoria na mesma transação.

## Tipos

```json
// Branding (resposta autenticada)
{
  "name": "string",            // nome de exibição (barbershops.name)
  "theme": "noir|day|leather",
  "primaryTone": "gold|terracotta|sage|blue|violet|rose|teal|orange|wine|graphite",
  "accentTone": "gold|...|graphite",
  "logoUrl": "string|null",    // caminho público do logo, com ?v=<versão>; nulo = sem logo
  "customized": true,           // false = aparência padrão (sem personalização salva)
  "updatedAt": "ISO 8601|null"
}

// PublicIdentity (resposta sem login)
{
  "name": "string|null",       // nulo quando o slug não existe
  "theme": "noir|day|leather",
  "primaryTone": "...",
  "accentTone": "...",
  "logoUrl": "string|null"
}
```

`logoUrl` aponta para `GET /public/barbershops/{slug}/logo?v=<versão>`; o caminho é relativo à base da API. Nas **respostas**, um tema ou tom que o cliente não conheça (por exemplo, um app antigo diante de um tema novo) é tratado como o padrão (`noir`, `gold`) em vez de falhar; as **entradas** continuam estritas. A lista de temas e a paleta (nomes e valores) **não** vêm da API: são constantes compartilhadas de `packages/domain` e `packages/ui`, as mesmas em painel, app e testes.

## Identidade (autenticado)

### `GET /branding` — session

`200`: `Branding`. Sem personalização salva devolve o padrão do produto (`noir`, `gold`, `gold`, `logoUrl: null`, `customized: false`) com o nome já cadastrado (FR-010). Resposta com `Cache-Control: private, no-store`: a mudança chega na próxima tela (FR-012, SC-006). Erros: `401`.

### `PUT /branding` — owner

Corpo: `{ "name": "string", "theme": "noir|day|leather", "primaryTone": "...", "accentTone": "..." }`.

- `name`: 1 a 80 caracteres após remover espaços das pontas; só espaços é recusado.
- `theme`, `primaryTone`, `accentTone`: somente os valores listados; cor livre não existe no contrato.

`200`: `Branding` salvo. Erros: `400 INVALID_DATA` (com `fields`), `401`, `403`. Eventos: `branding_updated`.

### `POST /branding/reset` — owner

Sem corpo. Restaura `noir`, `gold` e `gold`. **Não** altera o nome (FR-013) nem o logo. `200`: `Branding`. Erros: `401`, `403`. Evento: `branding_reset`.

## Logo (autenticado)

### `PUT /branding/logo` — owner

Corpo **binário cru**, `Content-Type: image/png`, `image/jpeg` ou `image/webp`, até 512 KB. Vale o tipo **detectado pelos bytes**; o cabeçalho é só dica.

`200`: `Branding` com o novo `logoUrl`. Erros: `413 LOGO_TOO_LARGE` (mais de 512 KB), `400 LOGO_UNSUPPORTED_FORMAT` (SVG, GIF ou outro), `400 LOGO_CONTENT_MISMATCH` (extensão ou cabeçalho de imagem, conteúdo de outro tipo ou arquivo truncado), `400 LOGO_INVALID_DIMENSIONS` (lado menor abaixo de 64 ou maior acima de 2.000 pixels), `401`, `403`. Em qualquer recusa o logo atual permanece. Evento: `logo_changed`.

### `DELETE /branding/logo` — owner

`200`: `Branding` com `logoUrl: null`. Idempotente: remover sem logo também responde `200`. Erros: `401`, `403`. Evento: `logo_removed` (só quando havia logo).

## Leitura pública (sem login)

Passam pelo limitador de chamadas por IP da Identidade (`429 TOO_MANY_REQUESTS`). Só leitura; nenhuma escrita é possível sem login.

### `GET /public/barbershops/{slug}/identity` — public

`200`: `PublicIdentity`. **Slug que não existe responde `200` com a identidade padrão do produto** (`name: null`, `noir`, `gold`, `gold`, `logoUrl: null`), no mesmo formato e com os mesmos cabeçalhos que uma barbearia existente sem personalização, e sem diferença de tempo observável (FR-030). Slug mal formado também recebe a resposta padrão. Cabeçalhos: `ETag` e `Cache-Control: no-cache` (revalida sempre; `304` quando não mudou). O corpo contém **somente** os campos acima (FR-029).

### `GET /public/barbershops/{slug}/logo` — public

`200` com a imagem: `Content-Type` do tipo detectado, `Cache-Control: public, max-age=31536000, immutable` (a versão está na URL), `ETag`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; sandbox` e `Content-Disposition: inline`. `404 NOT_FOUND` quando o slug não existe **ou** não há logo (mesma resposta nos dois casos).

## Registro de rotas

Acréscimo a `ROUTES` (`BRANDING_ROUTES`, 5 rotas autenticadas e 2 públicas). Campos novos opcionais em `RouteDefinition`, só para documentação: `body` (`{ kind: "binary", contentTypes, maxBytes }`) e `responseBinary` (`{ contentTypes }`). `routes.spec.ts` da API continua garantindo que toda rota dos controladores está no registro com o mesmo acesso.

## Rotas existentes usadas pelo app do dono (sem mudança)

| Ação | Rota | Feature |
|---|---|---|
| Ver catálogo | `GET /services`, `GET /service-categories` | 003 |
| Desativar e reativar serviço | `POST /services/{id}/deactivate`, `POST /services/{id}/reactivate` | 003 |
| Ver equipe | `GET /team` | 002 |
| Desativar membro | `POST /team/{id}/deactivate` | 002 |
| Reenviar convite | `POST /team/{id}/resend-invitation` | 002 |
