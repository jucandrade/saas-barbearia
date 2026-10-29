# Quickstart: validação da feature 004

Roteiro para provar, de ponta a ponta, que a identidade visual e o painel para computador funcionam. Rotas em [contracts/api.md](contracts/api.md) e tabelas em [data-model.md](data-model.md). Pré-requisitos: os das features 001 a 003 (Node, pnpm, Docker), uma barbearia provisionada com dono e um barbeiro convidado e ativo, e pelo menos duas barbearias para o cenário de isolamento.

## Cenário 1: preparar o ambiente

```
pnpm install
pnpm infra:up
pnpm db:migrate
pnpm db:migrate
pnpm dev
```

**Esperado**: o primeiro `db:migrate` aplica `0005_branding.sql` (inclui o preenchimento do `public_slug` das barbearias existentes); o segundo termina sem alterar nada. Conferir que toda barbearia existente ganhou um slug.

## Cenário 2: testes automatizados (sem banco)

```
pnpm test
```

**Esperado**: passam, em Linux e Windows, os testes de `packages/domain` (validação de tema e tom, `slugify`, `detectImage`/`validateLogo` com PNG, JPEG e WebP válidos, truncados, renomeados, SVG e GIF), de `packages/contracts` e de `packages/ui`, incluindo o **teste de contraste de 3 temas × 10 tons** (≥ 4,5:1 em texto sobre a base, a superfície e o preenchimento, e nas cores de estado).

## Cenário 3: testes de integração (com banco, só Linux)

```
pnpm test:integration
```

**Esperado**: passam a RLS das três tabelas novas, o vazamento entre barbearias (autenticado) e o **vazamento anônimo**: sem tenant nenhuma tabela é legível; as funções públicas devolvem só os campos do contrato; slug inexistente e barbearia sem personalização são indistinguíveis; `PUBLIC` e `app_public` não têm outros privilégios. Enfraquecer uma política (por exemplo `USING (true)` em `barbershop_branding`) deve fazer o teste de vazamento falhar.

## Cenário 4: personalizar tema, nome, logo e cores (US1, SC-001, SC-011)

1. Entrar como dono no painel e abrir **Identidade visual**.
2. Escolher o tema **Dia**, a cor principal **Azul** e a de destaque **Ouro**: a prévia mostra a barbearia no Dia com essas cores. Trocar para **Couro** e **Noir**: a prévia muda em menos de 10 segundos.
3. Alterar o nome para "Barbearia do Billy", enviar um logo PNG de 200 × 200 e salvar. O painel inteiro (cabeçalho, menu, botões, selos) adota tema, nome, logo e cores.
4. Cronometrar (SC-001): do abrir a tela ao ver o resultado no painel, menos de 2 minutos.

**Negativos**:

| Alteração | Esperado |
|---|---|
| Nome vazio, só espaços ou com 81 caracteres | Recusado, indicando o campo; nada é salvo |
| Logo SVG ou GIF | Recusado com o motivo; logo atual permanece |
| Logo de 513 KB; 512 KB exatos | O primeiro é recusado; o segundo aceito |
| Logo com 63 px de lado menor, ou com 2.001 px de lado maior | Recusado |
| Arquivo `.png` que na verdade é outro tipo | Recusado (`LOGO_CONTENT_MISMATCH`) |
| Cor ou tema fora da lista (pela API) | `400 INVALID_DATA`; não existe campo para digitar cor |
| Barbeiro tentando qualquer escrita (API) | `403 NO_PERMISSION`; sem sessão, `401` |
| Principal igual à destaque | Permitido; a tela continua legível e o selo de destaque não some |

## Cenário 5: a identidade aparece para todos (US2, SC-006)

1. Com o dono ainda no painel, entrar como o barbeiro no app: tema, nome, logo e cores da barbearia aparecem; o modo claro/escuro do aparelho **não** altera as telas (trocar o modo do celular e conferir).
2. Como dono, mudar o tema e salvar. No app do barbeiro, abrir uma tela nova: já vê a mudança, sem sair e entrar de novo.
3. Entrar como usuário de **outra** barbearia: vê a identidade dela, nunca a primeira.
4. Uma barbearia que nunca personalizou: aparência padrão (Noir e Ouro) com o nome cadastrado e sem logo.
5. Telas de entrar, convite e recuperação de senha: sempre a aparência padrão do produto.
6. Conferir que a organização das telas é a mesma nos três temas; só mudam fontes, fundos, formato e estilo.

## Cenário 6: página pública do link (FR-029, FR-030, SC-012)

1. Sem login (aba anônima), abrir `GET /public/barbershops/<slug>/identity`: devolve tema, nome, logo e cores, e **nenhum outro campo**. A imagem de `logoUrl` carrega sem login, com `nosniff` e `Content-Security-Policy`.
2. Abrir com um slug inexistente e com o de uma barbearia nunca personalizada: mesmo formato, mesmos cabeçalhos, mesmo tempo (sem diferença observável). O logo de slug inexistente responde `404`, igual ao de uma barbearia sem logo.
3. Como dono, trocar o logo: a URL do logo muda (`?v=`) e a página pública mostra o novo na próxima abertura.
4. Repetir 20+ chamadas rápidas ao mesmo endereço: o limitador responde `429`.

## Cenário 7: voltar ao padrão (US5)

1. Com logo e cores personalizados, remover o logo: some de todo o sistema e da página pública.
2. Restaurar o padrão: tema volta ao Noir, cores ao Ouro; o nome **não** muda.
3. Conferir a auditoria: cada alteração deixou um evento com autor e horário, sem o conteúdo do logo nem o texto do nome.

## Cenário 8: painel para computador (US3, SC-007, SC-008, SC-010)

1. Em um monitor de 1366 × 768, abrir o Catálogo: tabela com nome, categoria, duração, preço, situação e quantidade de executores; ao menos **15 serviços** visíveis sem rolagem.
2. Ordenar por cada coluna e filtrar por "só desativados" e "sem executor": a lista reflete na hora.
3. Abrir um serviço: a edição aparece em um painel ao lado e a lista continua visível. `Esc` fecha o painel e devolve o foco à linha.
4. Repetir na Equipe: mesmo padrão de tabela e painel lateral.
5. Cadastrar um serviço novo **só com o teclado** (Tab e Enter), sem tocar no mouse (SC-010).
6. Reduzir a janela para 360 px de largura: nenhuma tela do painel exige rolagem horizontal e toda ação continua alcançável (SC-008).

## Cenário 9: funções rápidas do dono no app (US4, SC-009)

1. Entrar no app como dono: ver as áreas **Catálogo** e **Equipe**.
2. Desativar e reativar um serviço; desativar um membro da equipe em até **3 toques** a partir da tela inicial; reenviar o convite de um membro pendente.
3. Conferir que **não existe** criar ou editar serviço, preço, executor, categoria, identidade visual nem convidar pessoas; o texto orienta a usar o computador.
4. Ligar o modo avião e tentar desativar um serviço: mensagem de que a ação precisa de conexão, nada alterado.
5. Entrar como barbeiro: continua vendo só a consulta de serviços, sem funções de gestão.
6. Sessão do dono no app: expira após 12 horas sem uso (coberta por teste; manualmente, ajustar o relógio de teste).

## Verificação de telas

As telas do painel e do app são verificadas por tipos, lint e build (`next build`, `expo export`). A conferência visual dos três temas, da composição (selo de destaque nunca sobre fundo principal) e do painel é manual, pelos cenários 4, 5 e 8.
