# Research: Identidade visual da barbearia e painel do dono para computador

Decisões da Fase 0, no formato Decisão / Racional / Alternativas. Pontos já resolvidos nas features 002 e 003 (RLS com `FORCE`, papéis do banco, `TenantDb`, sessão, `Clock`, formato de erro, registro de rotas, `UserDirectory`, trilha de auditoria imutável) e no [ADR 0003](../../docs/adr/0003-app-do-cliente-e-marca-propria.md) são reaproveitados sem rediscussão. Nomes de código em inglês; textos ao usuário em português.

## R1. Fronteira do módulo de identidade visual

**Decisão**: novo `BrandingModule` em `apps/api/src/branding`, dentro do contexto "Identidade e Tenancy" da constitution. Ele é dono de três tabelas novas (`barbershop_branding`, `barbershop_logos`, `branding_events`). O **nome de exibição continua sendo `barbershops.name`** (spec, Assumptions: existe um único nome por barbearia). Para ler e renomear, o módulo usa uma porta pública da Identidade, `BarbershopDirectory` (`apps/api/src/identity/directory/barbershop-directory.ts`), com `getProfile(tx)` e `rename(tx, name)`. Assim o cabeçalho do painel, que já lê `/auth/me`, passa a mostrar o novo nome sem mudança.

**Racional**: princípio VI (um módulo não lê tabela de outro, mesma regra da 003) com o menor custo. Nome único evita dois "nomes" divergentes.

**Alternativas**: coluna `display_name` própria em `barbershop_branding` (rejeitada: dois nomes por barbearia e o `/auth/me` ficaria desatualizado); o módulo atualizar `barbershops` direto (rejeitada: acopla o módulo à tabela da Identidade).

## R2. Identificador público do link da barbearia

**Decisão**: `barbershops` ganha a coluna `public_slug` (texto, único, 3 a 40 caracteres, `[a-z0-9-]`, sem hífen nas pontas). A migration preenche as barbearias existentes e o provisionamento passa a gerar o slug a partir do nome (função pura `slugify` no domínio, com sufixo numérico em caso de colisão). A 004 **não** oferece edição do slug: trocar o endereço de um link já divulgado é decisão da feature de agendamento, que é dona do link e da página.

**Racional**: a leitura pública (FR-029) precisa de uma chave que não seja o `tenant_id` interno. A spec diz que o identificador pertence à agendamento; aqui entra só a coluna mínima, sem a qual a 004 não consegue entregar o que prometeu (princípio X, exceção de estrutura de baixo custo que evita migração previsível).

**Alternativas**: usar o `id` (uuid) da barbearia no link (rejeitada: expõe o identificador interno de tenant e gera links ilegíveis); adiar a coluna para a agendamento (rejeitada: a 004 ficaria sem como testar a leitura pública).

## R3. Leitura pública sem login: função dedicada

**Decisão**: duas funções `SECURITY DEFINER` no banco, `public_get_identity(p_slug text)` e `public_get_logo(p_slug text)`, no mesmo desenho das funções `auth_*` da 002. Pertencem ao papel novo `app_public` (`NOLOGIN`, sem `BYPASSRLS`), que recebe `SELECT` só nas três tabelas de que precisa, com políticas `*_public_read` exclusivas para esse papel. `public_get_identity` devolve exclusivamente `theme`, `primary_tone`, `accent_tone`, `name`, `logo_version` (texto) e `updated_at`; `public_get_logo` devolve `content`, `content_type` e `version`. `PUBLIC` perde `EXECUTE`; só `app_runtime` (a API) e o papel de migrations executam. Slug inexistente devolve **zero linhas** e a API responde com a identidade padrão do produto (FR-030). Nenhuma tabela ganha política de leitura para `app_runtime` sem tenant; o visitante anônimo continua sem ler nada direto.

**Racional**: constitution 1.1.0 (Princípio I): leitura anônima só por função dedicada com campos mínimos. Reaproveita o padrão já testado e o mesmo tipo de teste de vazamento.

**Lacuna conhecida**: hoje `barbershops` não tem situação "desativada", então a função filtra só por slug. A feature que introduzir a desativação de barbearias precisa atualizar a função (FR-030 já exige a resposta padrão); fica registrado em `tasks.md` como teste pendente.

**Alternativas**: política de leitura anônima nas tabelas (rejeitada: proibido pela constitution); endpoint que abre transação com o `tenant_id` achado por slug (rejeitada: exigiria uma consulta anterior sem tenant, que é justamente o que a função encapsula).

## R4. Armazenamento do logo

**Decisão**: o logo fica numa tabela própria, `barbershop_logos` (`bytea`, tipo, largura, altura, tamanho, versão), separada de `barbershop_branding` para que a leitura da identidade nunca traga os bytes. Servido por `GET /public/barbershops/{slug}/logo`, que lê só pela função `public_get_logo`. Sem armazenamento de objetos agora: a hospedagem ainda é decisão aberta (constitution) e um logo de até 512 KB cabe com folga no Postgres. A URL do logo carrega a versão (`?v=<hash>`), então a resposta pode ter `Cache-Control: public, max-age=31536000, immutable`, e a troca de logo muda a URL.

**Cabeçalhos do logo** (conteúdo enviado por usuário): `Content-Type` vem do tipo **detectado** (nunca do enviado), `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; sandbox`, `Content-Disposition: inline`.

**Racional**: atende a regra "armazenamento separado que serve só esse conteúdo" sem nova infraestrutura (princípio X). Migrar para armazenamento de objetos depois muda só o adaptador.

**Limitação aceita**: não há reencode da imagem, então metadados (como EXIF) permanecem no arquivo. Reencodar exigiria uma biblioteca nativa (por exemplo `sharp`) e o logo de uma barbearia é conteúdo que ela já quer público. Revisitar se aparecer imagem de pessoas.

**Alternativas**: armazenamento de objetos (rejeitada agora: hospedagem indefinida); SVG (já fora do escopo da spec); colocar os bytes na própria `barbershop_branding` (rejeitada: toda leitura de identidade puxaria até 512 KB).

## R5. Validação do logo sem dependência nova

**Decisão**: `detectImage(bytes)` é função pura em `packages/domain` que reconhece PNG, JPEG e WebP **pelos bytes iniciais** (assinatura) e lê largura e altura do cabeçalho (PNG: `IHDR`; JPEG: primeiro marcador `SOF`; WebP: `VP8`, `VP8L` e `VP8X`). Devolve `{ type, width, height }` ou `undefined`. `validateLogo(bytes)` aplica 512 KB, lado menor ≥ 64 e lado maior ≤ 2.000 e devolve o primeiro motivo de recusa. Arquivo renomeado, truncado ou de outro tipo (SVG, GIF) vira recusa. Escrita em TDD, com arquivos de exemplo mínimos montados em bytes nos testes.

**Racional**: FR-003 e SC-003 (100% das recusas) com função testável, determinística e sem biblioteca de imagem. Não decodifica pixels, então não há superfície de ataque de decodificador.

**Alternativas**: `sharp` ou `image-size` (rejeitadas: dependência nativa ou externa para ler seis campos de cabeçalho).

## R6. Envio do logo

**Decisão**: `PUT /branding/logo` com o corpo binário cru (`Content-Type: image/png`, `image/jpeg` ou `image/webp`), limite de 512 KB no parser (acima disso `413`). O tipo do cabeçalho é só dica: vale o detectado, e divergência é recusada. O registro de rotas ganha o campo opcional `body: { kind: "binary", contentTypes, maxBytes }` para documentar no OpenAPI. A configuração do parser (`express.raw` limitado a essa rota) vai para uma função `configureApp(app)` usada por `main.ts` e pelo helper de testes, para o teste de integração exercitar o mesmo caminho da produção.

**Racional**: corpo cru evita multipart (dependência `multer`) e a inflação de 33% do base64. Sem mudar o corpo JSON das demais rotas.

**Alternativas**: base64 em JSON (rejeitada: 512 KB viram ~683 KB e o limite global do JSON teria de subir para todas as rotas); `multipart/form-data` (rejeitada: dependência e parser a mais).

## R7. Temas, paleta e contraste

**Decisão**: três temas fechados, `noir`, `day` e `leather` (nomes de exibição Noir, Dia e Couro), e uma paleta fechada de **10 tons**. Os identificadores (`THEME_IDS`, `TONE_IDS`) vivem em `packages/domain` (usados pelo contrato Zod e pelas colunas do banco). Os valores de cor, fontes e formato vivem em `packages/ui` (dados puros, sem React). Cada tom tem duas variantes: a **clara** é usada nos temas escuros (Noir e Couro) e a **escura** no tema claro (Dia):

| Tom | Nome | Variante p/ tema escuro | Variante p/ tema claro |
|---|---|---|---|
| `gold` | Ouro (padrão) | `#D4A853` | `#946006` |
| `terracotta` | Terracota | `#E07A5F` | `#A5412A` |
| `sage` | Sálvia | `#7FB77E` | `#2F6B4F` |
| `blue` | Azul | `#7FA8F0` | `#2A4FB0` |
| `violet` | Violeta | `#B79CF0` | `#5B3FB0` |
| `rose` | Rosa | `#EE8FB0` | `#A62F63` |
| `teal` | Turquesa | `#4FC4C0` | `#116B6B` |
| `orange` | Laranja | `#F29A4E` | `#A5520A` |
| `wine` | Vinho | `#E3808E` | `#8C2A3C` |
| `graphite` | Grafite | `#C9C6BE` | `#47443D` |

Bases dos temas (dos mockups da Rodada 2): Noir `#111111` / superfície `#1C1C1C` / texto `#F2EDE4`; Dia `#FAF7F2` / `#FFFFFF` / `#17140F`; Couro `#0E2620` / `#153229` / `#EFE9DC`. Fontes: Noir e Dia usam Bricolage Grotesque (títulos) e Inter (texto); Couro usa Fraunces (títulos) e Inter.

**Garantia de contraste (FR-005, SC-002)**: como cada tom funciona independentemente (uma cor de texto sobre a base, uma cor de texto sobre o preenchimento, calculada), qualquer par principal × destaque é seguro se **cada tom** passar em **cada tema**. O teste percorre 3 temas × 10 tons e exige, por WCAG, razão ≥ 4,5:1 para: tom como texto/link sobre a base e sobre a superfície; texto escuro ou claro (o de maior contraste) sobre o preenchimento do tom. Os mesmos testes cobrem o texto principal, o texto secundário e as três cores de estado (fixas, FR-023) sobre cada base. Validado em simulação antes de escrever o plano: os 30 casos de tom passam.

**Achado nos mockups**: o âmbar do Dia (`#A86B0C`) tem 4,12:1 sobre o fundo `#FAF7F2` e **reprova** o limite de 4,5:1; a variante clara do Ouro passou para `#946006`. Os demais valores dos mockups foram preservados. O desenho do Dia deve usar o valor novo.

**Regra de composição**: o selo de destaque nunca é desenhado diretamente sobre um fundo preenchido com a cor principal (principal = destaque é permitido pela spec e ficaria invisível); em cabeçalhos preenchidos, o selo usa borda na cor do texto do preenchimento.

**Cores de estado** (fixas por tema, FR-023): erro/aviso/sucesso `#FF8A80`/`#F2B84B`/`#6FCF97` nos temas escuros e `#B3261E`/`#8A5A00`/`#1E7B4A` no claro, todas ≥ 4,5:1 nas bases.

**Alternativas**: variante única por tom (rejeitada: tom claro some no Dia e tom escuro some no Noir); cálculo automático de luminosidade em tempo de execução (rejeitada: imprevisível; a tabela fixa é revisável por designer e testável); mais de 10 tons (rejeitada: a spec pede 8 a 12 e cada tom multiplica o teste visual).

## R8. Aplicar o tema no painel (Next.js)

**Decisão**: `resolveBrandTokens(theme, primary, accent)` (função pura em `packages/ui`) devolve os valores. O painel os grava como variáveis CSS no elemento `<html>` (`data-theme` + estilo) por um `BrandingProvider` que lê `GET /branding`. As variáveis **mantêm os nomes atuais** de `globals.css` (`--background`, `--text`, `--accent`, `--accent-text`, `--error`, `--surface`, `--border`, `--text-muted`) e ganham `--highlight` e `--highlight-text` (cor de destaque), `--font-display`, `--font-body`, `--radius-*`. Assim as telas existentes (Equipe, Catálogo, entrar) adotam o tema sem reescrever. O bloco `@media (prefers-color-scheme: dark)` sai (FR-026). Fontes por `next/font/google` (Bricolage Grotesque, Inter e Fraunces, com `variable` e `display: swap`), expostas como variáveis CSS e escolhidas pelo tema.

**Antes de carregar a identidade** (e nas telas de entrar, convite e recuperação, FR-011), vale o padrão do produto (Noir + Ouro). O provedor mostra um fundo neutro até a resposta chegar, para o dono de uma barbearia no Dia não ver um lampejo escuro.

**Racional**: baixo risco (mesmos nomes de variáveis), uma fonte única de tokens para web e mobile, sem biblioteca de CSS nova.

**Alternativas**: Tailwind ou CSS-in-JS (rejeitadas: dependência e reescrita sem ganho); renderizar o tema no servidor (rejeitada: o painel autentica por cookie contra a API em outra origem, então a leitura é feita no cliente, como o `Header` já faz).

## R9. Aplicar o tema no app (Expo)

**Decisão**: `BrandingProvider` e `useBrand()` no `apps/barber`, com os mesmos `resolveBrandTokens`. As telas existentes (entrar, início, catálogo) trocam as cores fixas dos `StyleSheet` por tokens. Fontes: `expo-font` (`useFonts`) com `@expo-google-fonts/bricolage-grotesque`, `@expo-google-fonts/inter` e `@expo-google-fonts/fraunces`, mantendo a tela de abertura até as fontes e a identidade carregarem (ou falharem, caindo no padrão). A barra de status acompanha o claro/escuro do tema. O app **ignora o modo do aparelho** para as telas da barbearia (FR-026).

**Dependências novas**: `expo-font`, `expo-splash-screen` e os três pacotes de fonte. Registradas em Complexity Tracking.

**Racional**: confirmado na documentação atual do Expo (`useFonts` + `SplashScreen.preventAutoHideAsync`). O mesmo provedor e os mesmos tokens servirão ao app do cliente (ADR 0003), sem retrabalho.

**Alternativas**: fonte do sistema no app (rejeitada: os mockups definem as fontes e o Couro depende da serifada); carregar só as fontes do tema ativo (rejeitada para agora: complica o carregamento por uma economia pequena).

## R10. Auditoria da identidade

**Decisão**: tabela própria `branding_events`, imutável (`SELECT` e `INSERT` para `app_runtime`, gatilho contra `UPDATE`, `DELETE` e `TRUNCATE`), no desenho de `catalog_events`. Tipos: `branding_updated`, `logo_changed`, `logo_removed` e `branding_reset`. `details` guarda só nomes de campos alterados e, para tema e tons, valor anterior e novo (são identificadores fechados, não dados pessoais). **Nunca** guarda o conteúdo do logo nem o texto do nome: o evento diz que `displayName` mudou, sem o valor (também respeita a lista de chaves proibidas já usada no catálogo). Gravado na mesma transação da operação (FR-014).

**Racional**: mesmo desenho e mesma garantia de 003. Duas pessoas salvando ao mesmo tempo: vale a última e os dois eventos ficam (spec, caso de borda).

**Alternativas**: reusar `catalog_events` ou `security_events` (rejeitadas: acoplaria enums de contextos diferentes, como já decidido na 003).

## R11. Contratos e registro de rotas

**Decisão**: schemas Zod em `packages/contracts/src/branding/`, registro `BRANDING_ROUTES` somado a `ROUTES`. Dois ajustes no registro: o campo opcional `body` (corpo binário, R6) e o campo opcional `responseBinary` (resposta de imagem, R4), ambos só para documentar no OpenAPI 3.1; as rotas existentes não mudam. `access: "public"` já existe. Os tons e temas são `z.enum` a partir de `THEME_IDS` e `TONE_IDS`, então valor fora da paleta é recusado no contrato **e** por `CHECK` no banco.

**Racional**: princípio V (contratos primeiro) e FR-004 (recusar cor fora da paleta em todas as camadas).

## R12. Leitura pública: cache, limite de chamadas e CORS

**Decisão**: `GET /public/barbershops/{slug}/identity` responde com `ETag` e `Cache-Control: no-cache` (revalida sempre, barato com `304`), para a página do link nunca mostrar um visual desatualizado depois de o dono mudar (FR-012). Resposta de slug inexistente é **idêntica em formato e cabeçalhos** à de slug existente sem personalização, exceto pelo conteúdo, e percorre o mesmo caminho de código (uma única chamada à função, sem ramificação que mude o tempo), de modo que não há diferença observável (FR-030). As duas rotas públicas passam pelo limitador de chamadas por IP já existente (`RATE_LIMIT_PER_MINUTE`, o mesmo da Identidade), contra varredura de slugs. A página do link é renderizada no servidor (`apps/booking`, chamada de servidor para servidor) e os apps nativos não usam CORS, então a lista de origens (`ADMIN_BASE_URL`) não muda.

**Racional**: FR-029, FR-030 e SC-012. A resposta padrão para slug desconhecido impede enumerar quais barbearias existem.

**Alternativas**: cache longo da identidade (rejeitada: atraso visível depois da troca); `404` para slug desconhecido (rejeitada: a spec exige a aparência padrão e a mesma resposta).

## R13. Painel do dono para computador

**Decisão**: Catálogo e Equipe passam a ser tabelas que ocupam a largura da tela, com ordenação e filtros no cliente (o catálogo cabe em uma resposta, 003/R9, e a equipe é pequena), e a edição abre em um **painel lateral** que mantém a lista visível. Componentes locais ao admin (`DataTable`, `SidePanel`, `FilterBar`) em `apps/admin/app/components`; não vão para `packages/ui` porque aquele pacote não tem React (consistente com R7). Teclado: formulários nativos (Tab e Enter), foco vai para o painel ao abrir e volta à linha ao fechar, `Esc` fecha. Tela estreita (até 768 px): a tabela vira lista empilhada e o painel ocupa a tela, sem rolagem horizontal da página (FR-018, SC-008). SC-007: 15 linhas visíveis em 1366 × 768 exigem altura de linha de até 40 px com o cabeçalho; vira critério de teste visual manual no quickstart.

**Racional**: a lógica de filtro e ordenação (por situação, "sem executor", nome, categoria, duração e preço — FR-016) é pura e vai para `packages/domain` (`filterServices`, `sortServices`), testada antes (princípio IV).

**Alternativas**: filtros e ordenação no servidor (rejeitada: 100 serviços cabem em uma resposta; a 003 mediu); biblioteca de tabela (rejeitada: dependência para o que três funções puras resolvem).

## R14. Funções rápidas do dono no app

**Decisão**: sem endpoint novo. O app do dono usa as rotas que já existem: `GET /services` e `POST /services/{id}/deactivate|reactivate` (003) e `GET /team`, `POST /team/{id}/deactivate` e `POST /team/{id}/resend-invitation` (002). A tela inicial do app, para quem tem papel `owner`, mostra "Catálogo" e "Equipe" com essas ações; nenhum botão de criar ou editar existe (FR-019), e o texto orienta a usar o computador. Sem conexão, a ação falha com a mensagem "Esta ação precisa de conexão" e não altera nada. A sessão de 12 horas do dono (FR-022) **já é a regra da 002** (`sessionDuration`): esta feature só a protege com um teste novo para o login do app. Desativar membro em até 3 toques (SC-009): início → Equipe → membro → Desativar com confirmação.

**Racional**: reaproveita regras já protegidas por papel no servidor (a restrição do app é de tela, não de segurança, como diz a spec).

## R15. Testes

**Decisão**:
- **Domínio e UI (sem banco, Linux e Windows)**: tema e tom (validadores), `slugify`, `detectImage`/`validateLogo`, `filterServices`/`sortServices`, `resolveBrandTokens` e o teste de contraste dos 3 temas × 10 tons.
- **Contratos**: schemas aceitam e recusam o esperado, incluindo tom e tema fora da lista; `routes.spec.ts` cobre as novas rotas.
- **Integração (`apps/api`, Postgres do Compose, só Linux)**: RLS das três tabelas; **vazamento autenticado** (barbearia B nunca lê nem altera a identidade ou o logo da A); **vazamento anônimo** (`branding-public.spec.ts`): sem tenant nenhuma tabela é legível, as funções só devolvem os campos de FR-029, slug inexistente e existente sem personalização são indistinguíveis, os papéis `PUBLIC` e `app_public` não ganham outros privilégios; permissões (barbeiro e anônimo negados nas escritas); logos inválidos recusados com o anterior preservado; auditoria completa sem conteúdo do logo; sessão de 12 horas do dono via login do app.
- **Telas**: tipos, lint e build, como na 002 e 003. Verificação visual de temas e do painel no quickstart (manual).

**Racional**: princípio I (testes de vazamento) e a constitution 1.1.0 (provar o que o anônimo lê e não lê).

## R16. Dependências

**Decisão**: nenhuma no `apps/api`, `packages/domain`, `packages/contracts` e `apps/admin` (`next/font` já faz parte do Next.js). No `apps/barber`: `expo-font`, `expo-splash-screen`, `@expo-google-fonts/bricolage-grotesque`, `@expo-google-fonts/inter` e `@expo-google-fonts/fraunces`, versões fixadas pelo `expo install`. `packages/ui` passa a depender de `@barbearia/domain`.
