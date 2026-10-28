# Implementation Plan: Identidade visual da barbearia e painel do dono para computador

**Branch**: `004-barbershop-branding` | **Date**: 2026-10-28 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/004-barbershop-branding/spec.md`

## Summary

A barbearia ganha identidade própria: o dono escolhe um **tema** (Noir, Dia ou Couro), o **nome de exibição**, o **logo** e duas **cores** de uma paleta fechada de 10 tons, e isso vale para dono, barbeiro e cliente, no painel e nos apps. Em paralelo, as telas de gestão do dono (Catálogo e Equipe) viram tabelas com painel lateral, pensadas para computador, e o app do dono ganha as funções rápidas.

Desenho: o módulo `BrandingModule` (contexto Identidade e Tenancy) tem três tabelas novas com `tenant_id` + RLS com `FORCE`; o nome continua sendo `barbershops.name`, acessado por uma porta da Identidade. A **leitura sem login** (página do link da barbearia) só acontece por **duas funções `SECURITY DEFINER`** de campos mínimos, de um papel `app_public` sem login e sem tabela aberta, como manda a constitution 1.1.0. O logo (PNG, JPEG ou WebP, até 512 KB) fica em tabela separada, validado **pelos bytes** por uma função pura do domínio, sem biblioteca de imagem. Tema e paleta são dados em `packages/ui`: cada tom tem uma variante para fundo escuro e outra para fundo claro, e um teste de **3 temas × 10 tons** garante contraste ≥ 4,5:1, o que torna toda combinação principal × destaque legível. As variáveis CSS do painel mantêm os nomes atuais, então as telas existentes adotam o tema sem reescrita. O app usa os mesmos tokens e ignora o modo claro/escuro do aparelho. Detalhes e alternativas em [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript (`strict`) sobre Node.js 24 LTS, como nas features anteriores.

**Primary Dependencies**: nenhuma nova na API, no domínio, nos contratos e no admin (`next/font` é do Next.js). No `apps/barber`: `expo-font`, `expo-splash-screen` e três pacotes de fonte `@expo-google-fonts` ([R9](research.md#r9-aplicar-o-tema-no-app-expo), [R16](research.md#r16-dependências)). `packages/ui` passa a depender de `@barbearia/domain`.

**Storage**: PostgreSQL 17 com RLS (o da 002), mesmo par de papéis (`app_runtime` na API, dono do esquema nas migrations) mais o papel `NOLOGIN` `app_public` para as duas funções de leitura pública. Três tabelas novas, uma coluna nova em `barbershops` e uma migration (`0005_branding.sql`) ([data-model.md](data-model.md)).

**Testing**: Vitest. Unitários em `packages/domain`, `packages/contracts` e `packages/ui` (sem banco, Linux e Windows), incluindo o teste de contraste e a leitura de cabeçalhos de imagem. Integração em `apps/api` contra o Postgres do Compose, com migrations reais e a suíte de vazamento estendida às tabelas novas e à **leitura anônima** ([R15](research.md#r15-testes)). Sem teste de interface além de tipos, lint e build, como na 002 e 003; a conferência visual é manual ([quickstart.md](quickstart.md)).

**Target Platform**: Desenvolvimento em Windows 11 e Linux; CI em `ubuntu-latest` e `windows-latest`. Integração roda só no Linux.

**Project Type**: Monorepo existente; esta feature toca `apps/api`, `apps/admin`, `apps/barber`, `packages/domain`, `packages/contracts` e `packages/ui`.

**Performance Goals**: troca de tema com prévia em menos de 10 segundos (SC-011); identidade lida em uma consulta por requisição; tabela do Catálogo com 15 serviços visíveis em 1366 × 768 (SC-007); logo servido com cache imutável por versão ([R4](research.md#r4-armazenamento-do-logo)).

**Constraints**: RLS com falha fechada nas três tabelas; leitura anônima só por função dedicada, campos mínimos, sem tabela aberta (constitution, Princípio I); nenhum dado pessoal nem conteúdo do logo nos eventos de auditoria (Princípio IX); mensagens ao usuário em português; `pnpm test` da raiz continua sem exigir banco; comandos iguais em PowerShell e bash; sem rolagem horizontal em 360 px (SC-008); organização das telas igual nos três temas (FR-025).

**Scale/Scope**: 3 tabelas, 1 coluna nova, 2 funções públicas, 8 endpoints (6 autenticados e 2 públicos), 4 tipos de evento de auditoria, 3 temas, 10 tons, 1 tela de identidade visual, 2 telas de gestão redesenhadas (Catálogo e Equipe), e 2 áreas novas no app do dono.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution **1.2.0**.

| Princípio / Restrição | Status | Observação |
|---|---|---|
| I. Multi-tenancy (inclui regras de leitura pública da 1.1.0) | ✅ | `tenant_id` e RLS com `FORCE` nas três tabelas; API sem `BYPASSRLS`; falha fechada. Leitura sem login só pelas funções `public_get_identity` e `public_get_logo`, com campos mínimos e papel `app_public`; nenhuma tabela aberta a anônimo; logo em tabela separada que serve só esse conteúdo ([R3](research.md#r3-leitura-pública-sem-login-função-dedicada), [R4](research.md#r4-armazenamento-do-logo)). Testes de vazamento autenticado e **anônimo** ([R15](research.md#r15-testes)). |
| II. Integridade financeira | N/A | Sem valores monetários nem ledger. O painel apenas exibe preços do catálogo (003) com a formatação existente. |
| III. Regras parametrizáveis | N/A | Temas e paleta são conjuntos fechados definidos pelo produto, não regras de remuneração. |
| IV. Domínio puro e test-first | ✅ | Validação de tema, tom e nome, `slugify`, leitura de cabeçalho de imagem (`detectImage`/`validateLogo`) e filtros e ordenação do Catálogo são funções puras em `packages/domain`, com testes escritos antes. Sem golden test: não há cálculo financeiro. |
| V. Contratos primeiro | ✅ | Schemas Zod em `packages/contracts/src/branding/` antes da API; `BRANDING_ROUTES` entra em `ROUTES`; OpenAPI 3.1 gerado ([R11](research.md#r11-contratos-e-registro-de-rotas), [contracts/api.md](contracts/api.md)). Tom e tema fora da lista recusados no contrato **e** por enum no banco. |
| VI. Monólito modular | ✅ (com notas) | Novo `BrandingModule` com tabelas próprias; lê e renomeia `barbershops` apenas pela porta `BarbershopDirectory` da Identidade ([R1](research.md#r1-fronteira-do-módulo-de-identidade-visual)). As funções públicas leem `barbershops` no nível do banco, por papel dedicado. Ver Complexity Tracking. |
| VII. Confiabilidade de integrações e jobs | N/A | Sem webhook nem job. Toda escrita grava evento com autor e horário na mesma transação (trilha de auditoria). |
| VIII. Mobile-first e simplicidade | ✅ | O painel do dono é pensado primeiro para computador por decisão da spec, e o dono não é cliente nem barbeiro, então não conflita; segue usável em 360 px. Apps de barbeiro e cliente são mobile-first. O link público segue leve e renderizado no servidor. |
| IX. Privacidade e LGPD | ✅ | Eventos só com identificadores e valores fechados, nunca o texto do nome nem o logo ([R10](research.md#r10-auditoria-da-identidade)); a leitura pública devolve só tema, nome, logo e cores. Limitação conhecida e aceita: o logo não é reencodado, então metadados da imagem permanecem ([R4](research.md#r4-armazenamento-do-logo)). |
| X. Simplicidade e entrega por fases | ✅ | Sem armazenamento de objetos, sem biblioteca de imagem, sem biblioteca de CSS. Estrutura de baixo custo que evita migração previsível: `public_slug` ([R2](research.md#r2-identificador-público-do-link-da-barbearia)). |
| Restrições técnicas (TS strict, NestJS, PostgreSQL com RLS, Next.js, Expo) | ✅ | Seguidas. O app do cliente (constitution 1.2.0, ADR 0003) é de outra feature; esta entrega o tema e a leitura pública que ele usará. |
| Decisões abertas (gateway, hospedagem) | N/A | A hospedagem segue aberta; por isso o logo fica no Postgres e migrar para armazenamento de objetos muda só o adaptador. |
| Fluxo: PR com testes, lint e type-check | ✅ | A CI já roda `Migrate` e `Integration test`; nenhuma etapa nova. |

**Resultado (pré-pesquisa)**: aprovado, sem decisão aberta bloqueante.
**Resultado (pós-design)**: aprovado, com cinco notas justificadas em Complexity Tracking.

**Decisões que dependem de fora desta feature**:

- **Mockup do Dia**: o âmbar `#A86B0C` reprova o contraste mínimo (4,12:1 sobre o fundo); o plano adota `#946006` ([R7](research.md#r7-temas-paleta-e-contraste)). O desenho precisa ser atualizado antes da implementação das telas.
- **Desativação de barbearia**: ainda não existe; quando existir, a função pública deve atender FR-030 ([R3](research.md#r3-leitura-pública-sem-login-função-dedicada)).
- **Página do link e app do cliente**: pertencem à feature de agendamento (ADR 0003); esta feature só entrega a leitura pública e os tokens.

## Project Structure

### Documentation (this feature)

```text
specs/004-barbershop-branding/
├── plan.md              # Este arquivo
├── research.md          # Fase 0: decisões e alternativas (R1 a R16)
├── data-model.md        # Fase 1: tabelas, RLS, funções públicas, regras
├── quickstart.md        # Fase 1: roteiro de validação ponta a ponta
├── contracts/
│   └── api.md           # Contrato dos 8 endpoints
├── checklists/
│   └── requirements.md  # Qualidade da spec
└── tasks.md             # Fase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
.
├── apps/
│   ├── api/
│   │   ├── drizzle/0005_branding.sql              # enums, tabelas, RLS, papel app_public, funções públicas, imutabilidade, slug
│   │   ├── src/
│   │   │   ├── db/schema/                         # + barbershop-branding, barbershop-logo, branding-event; barbershop.ts ganha public_slug
│   │   │   ├── identity/
│   │   │   │   ├── directory/barbershop-directory.ts   # porta: perfil e renomear (novo)
│   │   │   │   └── provisioning/provisioning.service.ts # passa a gerar o public_slug
│   │   │   ├── branding/                          # BrandingModule
│   │   │   │   ├── branding.module.ts
│   │   │   │   ├── branding.controller.ts         # GET/PUT /branding, POST /branding/reset
│   │   │   │   ├── logo.controller.ts             # PUT/DELETE /branding/logo
│   │   │   │   ├── public-branding.controller.ts  # identity e logo, sem login
│   │   │   │   ├── branding.service.ts
│   │   │   │   ├── public-branding.service.ts     # chama as funções public_get_*
│   │   │   │   └── branding-audit.service.ts      # grava branding_events
│   │   │   ├── app-setup.ts                       # configureApp: CORS, parser raw do logo (novo, usado por main.ts e testes)
│   │   │   └── app.module.ts                      # + BrandingModule
│   │   └── test/
│   │       ├── integration/contract/              # um teste por endpoint novo
│   │       └── integration/                       # branding-rls, branding-leak, branding-public, branding-flows, branding-audit, owner-session
│   ├── admin/app/
│   │   ├── branding/                              # BrandingProvider, tela Identidade visual com prévia
│   │   ├── components/                            # DataTable, SidePanel, FilterBar (novos)
│   │   ├── catalog/                               # redesenhado: tabela + painel lateral
│   │   ├── team/                                  # redesenhado: tabela + painel lateral
│   │   ├── layout.tsx                             # fontes (next/font) e provedor
│   │   └── globals.css                            # sem prefers-color-scheme; novas variáveis
│   └── barber/
│       ├── app/_layout.tsx                        # provedor de identidade, fontes, abertura
│       ├── app/                                   # telas usam tokens; áreas do dono (catálogo e equipe)
│       └── lib/branding.tsx                       # BrandingProvider e useBrand
└── packages/
    ├── domain/
    │   ├── src/branding/                          # THEME_IDS, TONE_IDS, validateDisplayName, slugify, detectImage, validateLogo
    │   ├── src/catalog/list.ts                    # filterServices, sortServices (puras)
    │   └── test/                                  # escritos antes da implementação
    ├── contracts/
    │   ├── src/branding/                          # schemas Zod + BRANDING_ROUTES
    │   └── test/
    └── ui/
        ├── src/branding/                          # PALETTE, THEMES, STATE_COLORS, resolveBrandTokens
        └── test/branding-contrast.spec.ts         # 3 temas × 10 tons
```

**Structure Decision**: Mantém o layout da constitution. O módulo vive em `apps/api/src/branding`, pasta irmã de `identity/` e `catalog/`. Identificadores de tema e tom ficam no domínio (os contratos e o banco dependem deles), e valores visuais ficam em `packages/ui` (dados puros, sem React), de onde painel e apps tiram os mesmos tokens. Os componentes de tabela e painel lateral ficam no admin, porque `packages/ui` não tem React.

## Complexity Tracking

| Ponto | Por que é necessário | Alternativa mais simples rejeitada porque |
|---|---|---|
| Papel `app_public` e duas funções `SECURITY DEFINER` para a leitura sem login | Constitution 1.1.0: leitura anônima só por função dedicada, sem abrir tabela. Mesmo desenho já provado das funções `auth_*` | Política de leitura anônima nas tabelas: proibida pela constitution e arriscada |
| As funções públicas leem `barbershops` direto no banco (nome e slug), embora o módulo só o acesse por porta | A função precisa devolver nome e identidade em uma consulta, sem tenant; a porta é código da aplicação e exige tenant | Duplicar o nome em `barbershop_branding`: dois nomes por barbearia e `/auth/me` desatualizado |
| Coluna `public_slug` em `barbershops`, que é da Identidade, introduzida por esta feature | A leitura pública precisa de chave que não seja o `tenant_id`; a feature de agendamento depende dela | Esperar a agendamento: a 004 não teria como entregar nem testar FR-029 |
| Tabela própria `branding_events` | Fronteira entre contextos, como `catalog_events` na 003 | Reusar `catalog_events`/`security_events`: acopla enums e testes de contextos diferentes |
| Logo em `bytea` no Postgres | Hospedagem indefinida; 512 KB cabem; sem infraestrutura nova | Armazenamento de objetos: decisão de hospedagem ainda aberta |
| Corpo binário no registro de rotas (`body`, `responseBinary`) e `configureApp` | Upload de logo sem `multipart` e sem inflar base64; testes exercitam o mesmo parser da produção | `multer` (dependência) ou base64 em JSON (limite global maior para todas as rotas) |
| Cinco dependências novas só em `apps/barber` (`expo-font`, `expo-splash-screen`, três fontes) | Os temas definem as fontes; sem elas o Couro perde a serifada e a identidade | Fonte do sistema no app: contraria os mockups aprovados |
| Componentes de tabela e painel lateral no admin, não em `packages/ui` | `packages/ui` não tem React; o app do dono não usa tabelas | Dar React ao `packages/ui` agora: ampliação de escopo sem outro consumidor |
