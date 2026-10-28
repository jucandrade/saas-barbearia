# Feature Specification: Identidade visual da barbearia e painel do dono para computador

**Feature Branch**: `004-barbershop-branding`

**Created**: 2026-10-22

**Status**: Draft

**Input**: User description: "Identidade visual da barbearia e painel do dono pensado para computador. O dono personaliza o nome de exibição, o logo (PNG, JPEG ou WebP com limite de tamanho) e as cores, escolhendo uma cor principal e uma cor de destaque em uma paleta pronta e fechada (cerca de 8 a 12 tons já testados para boa leitura em modo claro e escuro). O nome, o logo e as cores aparecem no painel de gestão e no app. O painel de gestão do dono passa a ser desenhado primeiro para computador (tabelas, painel lateral de edição, largura ampla), mas continua usável no celular. No app, o dono tem só algumas funções rápidas: ver o catálogo e a equipe, desativar e reativar um serviço, desativar um membro da equipe e reenviar convite; cadastros, preços, executores, identidade visual e demais configurações ficam só no computador. Apenas o dono altera a identidade visual, isolada por barbearia."

## User Scenarios & Testing *(mandatory)*

Os usuários desta feature são o **dono** (quem define a identidade da barbearia e gerencia o negócio), o **barbeiro** (que passa a ver o nome, o logo, as cores e o tema da barbearia onde trabalha) e o **cliente** (que vê a mesma identidade ao usar o app para agendar). Duas coisas acontecem juntas: a barbearia ganha a própria aparência (tema, logo e cores) e o painel do dono passa a ser pensado para quem trabalha sentado diante de um computador. Em toda operação vale o isolamento por barbearia definido na feature 002.

### User Story 1 - Personalizar o tema, o nome, o logo e as cores (Priority: P1)

O dono abre a tela de identidade visual do painel e define como a barbearia aparece: o tema (um entre três: Noir, Dia e Couro), o nome de exibição, o logo e duas cores (uma principal e uma de destaque), escolhidas de uma paleta pronta. O tema define o estilo visual (fundo claro ou escuro, fontes, formato dos componentes); as cores valem por cima de qualquer tema. Antes de salvar, ele vê uma prévia de como ficará.

**Why this priority**: É o pedido central da feature. Sem poder definir a identidade, nada mais tem o que mostrar.

**Independent Test**: Como dono, alterar o nome, enviar um logo e escolher duas cores da paleta; conferir a prévia, salvar e ver o painel já com a nova aparência.

**Acceptance Scenarios**:

1. **Given** um dono autenticado, **When** ele altera o nome de exibição e salva, **Then** o novo nome passa a valer em todo o sistema da barbearia.
2. **Given** uma imagem PNG, JPEG ou WebP dentro do limite de tamanho, **When** o dono a envia como logo, **Then** o logo é aceito, aparece na prévia e, ao salvar, passa a valer.
3. **Given** uma imagem de outro formato (por exemplo SVG ou GIF), acima do limite de tamanho, ou com dimensões fora do permitido, **When** o dono tenta enviá-la, **Then** o envio é recusado com a explicação do motivo e o logo atual não muda.
4. **Given** a paleta pronta, **When** o dono escolhe uma cor principal e uma de destaque, **Then** ele só encontra tons da paleta (não existe campo para digitar uma cor qualquer) e vê a prévia com essas cores.
5. **Given** um nome vazio ou longo demais, **When** o dono tenta salvar, **Then** nada é salvo e o problema é indicado.
6. **Given** um barbeiro autenticado, **When** ele tenta alterar o tema, o nome, o logo ou as cores, **Then** a operação é negada.
7. **Given** os três temas (Noir, Dia e Couro), **When** o dono escolhe um deles, **Then** a prévia mostra a barbearia naquele tema, com a cor principal e a de destaque já escolhidas, e qualquer tom da paleta pode ser usado em qualquer tema.
8. **Given** uma barbearia que nunca escolheu tema, **When** o dono abre a tela de identidade, **Then** o tema Noir aparece como o atual.

---

### User Story 2 - A identidade aparece para todos da barbearia (Priority: P1)

Dono, barbeiros e clientes veem o tema, o nome, o logo e as cores da barbearia: o dono e o barbeiro no painel de gestão e no app, o cliente no app de agendamento. Quem pertence a outra barbearia vê a identidade da sua própria. A organização das telas é a mesma nos três temas; o tema muda só o visual.

**Why this priority**: A personalização só tem valor se aparece de verdade onde a equipe trabalha. É o que dá à barbearia "o visual dela".

**Independent Test**: Definir a identidade como dono; entrar como barbeiro da mesma barbearia e ver tema, nome, logo e cores no app; entrar como cliente da mesma barbearia e ver o mesmo; entrar como usuário de outra barbearia e ver a identidade dela, não a primeira.

**Acceptance Scenarios**:

1. **Given** uma identidade salva, **When** um usuário da barbearia (dono, barbeiro ou cliente) entra no painel ou no app, **Then** ele vê o tema, o nome, o logo e as cores dela, e não os padrões do produto.
2. **Given** uma barbearia que nunca personalizou nada, **When** seus usuários entram, **Then** veem a aparência padrão do produto (tema Noir e cores padrão) com o nome já cadastrado, sem logo.
3. **Given** duas barbearias com identidades diferentes, **When** usuários de cada uma entram, **Then** cada um vê apenas a identidade da própria barbearia.
4. **Given** o dono salvou uma nova identidade, **When** os demais usuários abrem uma tela nova, **Then** já veem a mudança, sem precisar sair e entrar de novo.
5. **Given** qualquer um dos três temas com qualquer combinação de cores da paleta, **When** a identidade é exibida, **Then** nome, logo, cores e textos continuam legíveis. O claro ou escuro é definido pelo tema (Dia é claro; Noir e Couro são escuros) e o modo do aparelho não altera as telas da barbearia.
7. **Given** os três temas, **When** o usuário navega pelas telas, **Then** a organização das telas e das ações é a mesma em todos; mudam apenas fontes, fundo, formato e estilo dos componentes.
6. **Given** um usuário que ainda não entrou (tela de entrar, convite e recuperação de senha), **When** a tela é aberta, **Then** ela usa a aparência padrão do produto, pois ainda não se sabe a qual barbearia ele pertence.
8. **Given** o link público de uma barbearia, **When** uma pessoa sem conta o abre (por exemplo, um cliente que vai se cadastrar), **Then** a página mostra o tema, o nome, o logo e as cores daquela barbearia, sem exigir login.
9. **Given** o link de uma barbearia que não existe ou que foi desativada, **When** alguém o abre, **Then** vê uma página neutra com a aparência padrão do produto, sem revelar dados de nenhuma barbearia.

---

### User Story 3 - Painel do dono pensado para o computador (Priority: P2)

As telas de gestão do dono (Catálogo e Equipe) passam a ser desenhadas primeiro para o computador: aproveitam a largura da tela, mostram os registros em tabelas com ordenação e filtros, e abrem a edição em um painel lateral sem perder a lista de vista. No celular continuam funcionando.

**Why this priority**: O dono cadastra e revisa dezenas de registros sentado diante de uma tela grande; a versão de celular, estreita e empilhada, atrapalha esse trabalho. É essencial, mas depende de a identidade existir para ser o "rosto" do painel.

**Independent Test**: Abrir o Catálogo em um monitor comum, ver a lista inteira em tabela, filtrar por "sem executor", editar um serviço no painel lateral sem a lista sumir; abrir o mesmo painel em um celular e conferir que tudo continua alcançável, sem rolagem horizontal.

**Acceptance Scenarios**:

1. **Given** uma tela larga, **When** o dono abre o Catálogo, **Then** os serviços aparecem em uma tabela com nome, categoria, duração, preço, situação e quantidade de executores, aproveitando a largura da tela.
2. **Given** a tabela, **When** o dono ordena por uma coluna ou filtra (por exemplo "só desativados" ou "sem executor"), **Then** a lista reflete a escolha na hora.
3. **Given** um serviço na tabela, **When** o dono o abre para editar, **Then** a edição (dados e executores) aparece em um painel ao lado, e a lista continua visível.
4. **Given** a tela de Equipe, **When** o dono a abre em tela larga, **Then** ela segue o mesmo padrão de tabela e painel lateral.
5. **Given** o dono cadastrando vários serviços seguidos, **When** ele usa só o teclado (Tab e Enter), **Then** consegue preencher e salvar cada formulário sem usar o mouse.
6. **Given** uma tela estreita (celular), **When** o dono abre qualquer tela do painel, **Then** todo o conteúdo e todas as ações continuam acessíveis, sem rolagem horizontal da página.

---

### User Story 4 - Funções rápidas do dono no app (Priority: P3)

Quando o dono entra no app, ele encontra só algumas funções pensadas para o celular: ver o catálogo e a equipe, desativar e reativar um serviço, desativar um membro da equipe e reenviar um convite. O restante da gestão fica no computador.

**Why this priority**: Atende o dono que está longe do computador (por exemplo, alguém saiu da equipe e precisa perder o acesso agora, ou um serviço não pode ser oferecido hoje). É útil, mas o painel já cobre tudo.

**Independent Test**: Entrar no app como dono, ver o catálogo e a equipe, desativar e reativar um serviço, desativar um membro e reenviar um convite; conferir que não há ações de cadastro, preço, executores nem identidade visual.

**Acceptance Scenarios**:

1. **Given** um dono autenticado no app, **When** ele abre a área de gestão, **Then** vê a lista de serviços e a lista da equipe.
2. **Given** um serviço ativo, **When** o dono o desativa no app, **Then** ele deixa de ser oferecido, como no painel, e o dono pode reativá-lo.
3. **Given** um membro ativo da equipe, **When** o dono o desativa no app, **Then** a pessoa perde o acesso agora, como no painel.
4. **Given** um membro que ainda não aceitou o convite, **When** o dono pede o reenvio no app, **Then** um novo convite é enviado.
5. **Given** o dono no app, **When** procura criar ou editar serviços, preços, executores, categorias, identidade visual ou convidar novas pessoas, **Then** essas ações não existem no app; ele é orientado a fazê-las no computador.
6. **Given** um barbeiro autenticado no app, **When** ele abre o app, **Then** vê apenas a consulta de serviços da feature anterior, sem nenhuma função de gestão.

---

### User Story 5 - Voltar ao padrão do produto (Priority: P3)

O dono pode remover o logo e restaurar o tema e as cores padrão, voltando à aparência original do produto.

**Why this priority**: Quem experimenta e não gosta precisa de uma saída simples. Não bloqueia o resto.

**Independent Test**: Com logo e cores personalizados, remover o logo e restaurar o padrão; conferir que a barbearia volta à aparência padrão, mantendo o nome.

**Acceptance Scenarios**:

1. **Given** uma barbearia com logo, **When** o dono o remove, **Then** o logo deixa de aparecer em todo o sistema e o espaço volta ao padrão.
2. **Given** tema e cores personalizados, **When** o dono restaura o padrão, **Then** o tema volta ao Noir e as duas cores voltam às do produto.
3. **Given** a restauração, **When** concluída, **Then** o nome de exibição não é alterado.

---

### Edge Cases

- Logo exatamente no limite de tamanho é aceito; um byte acima é recusado.
- Logo com extensão de imagem, mas conteúdo de outro tipo (arquivo renomeado) é recusado.
- Logo com fundo transparente continua legível sobre claro e escuro; a tela mostra o logo sobre uma base que o preserva.
- Logo muito largo ou muito alto é exibido sem distorcer, ajustado ao espaço disponível.
- Nome com espaços nas pontas é aparado; nome só com espaços é recusado.
- Duas pessoas alterando a identidade ao mesmo tempo: vale a última a salvar, e as duas alterações ficam no registro.
- Cor principal igual à cor de destaque é permitida; o resultado continua legível.
- Um tom da paleta pouco contrastante com a base de um tema (por exemplo, tom claro sobre o fundo claro do Dia) continua legível: o texto sobre ele se ajusta, e nenhum tom da paleta pode deixar um tema ilegível.
- Uma barbearia com um tema que deixou de existir (conjunto de temas futuro revisado) cai no Noir, nunca em tela ilegível.
- Trocar de tema não apaga logo, nome nem cores já escolhidas.
- Uma mensagem de erro, aviso ou sucesso mantém a sua cor mesmo que a barbearia escolha um tom parecido para a identidade.
- Escolher um tom de uma paleta que deixou de existir (paleta futura revisada) cai no tom padrão, nunca em tela ilegível.
- Dono sem conexão no app: as funções rápidas informam que precisam de conexão e não fazem nada pela metade.
- Sessão do dono no app expira após 12 horas sem uso: o app pede nova entrada, e as funções rápidas não fazem nada pela metade.
- Um membro da equipe desativado deixa de ver a identidade, pois perde o acesso.

## Clarifications

### Session 2026-10-22

- Q: Por quanto tempo o dono pode ficar sem usar o app antes de precisar entrar de novo? → A: 12 horas sem uso, igual ao painel do dono (regra da feature 002, sem mudança).
- Q: Em quais partes da tela a cor principal e a cor de destaque são usadas? → A: A principal em botões, links, cabeçalho e item de menu ativo; a de destaque em selos, itens selecionados e realces; as cores de estado (erro, aviso, sucesso) são sempre fixas do produto, nunca da paleta.

### Session 2026-10-28

- Q: O dono também escolhe o tema do app? → A: Sim. Há três temas fechados (Noir, Dia e Couro), escolhidos só pelo dono, com Noir como padrão. O tema vale para toda a barbearia: dono, barbeiro e cliente.
- Q: O tema muda só o visual ou também a organização das telas? → A: Só o visual. A organização das telas é uma só, a do Noir; os mockups de Dia e Couro servem de referência de aparência.
- Q: O tema define claro/escuro ou o aparelho continua definindo? → A: O tema define. Dia é claro; Noir e Couro são escuros. O modo do aparelho não altera as telas da barbearia.
- Q: As duas cores funcionam em qualquer tema? → A: Sim, qualquer tom da paleta em qualquer tema, com a mesma regra de uso (principal em botões, links, cabeçalho e item ativo; destaque em selos, itens selecionados e realces).
- Q: Como o cliente chega à barbearia certa? → A: Pelo app na loja, com cadastro feito pelo próprio cliente (também para quem quer só um serviço avulso): pelo link ou QR da barbearia no app único, ou já dentro dela no app com marca própria (a piloto começa com o "Barbershop Tribo's"). O app, o link e o cadastro ficam na feature de agendamento.
- Q: A página do link da barbearia mostra a identidade dela? → A: Sim. A leitura sem login fica restrita a tema, nome, logo e cores; as telas de entrar, convite e recuperação de senha continuam com a aparência padrão.
- Q: Cada barbeiro pode escolher as próprias cores? → A: Não. A escolha de tema e cores é única por barbearia e só do dono; preferência por usuário fica fora desta feature.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST permitir ao dono alterar o nome de exibição da barbearia, com 1 a 80 caracteres após remover espaços das pontas.
- **FR-002**: O sistema MUST permitir ao dono enviar, trocar e remover o logo da barbearia, aceitando apenas imagens PNG, JPEG e WebP.
- **FR-003**: O logo MUST ter no máximo 512 KB, com lado menor de pelo menos 64 pixels e lado maior de no máximo 2.000 pixels; arquivos fora desses limites, de outro formato ou cujo conteúdo não corresponda ao formato declarado MUST ser recusados com explicação clara, sem alterar o logo atual.
- **FR-004**: O sistema MUST oferecer uma paleta pronta e fechada de 8 a 12 tons, e o dono MUST escolher dela uma cor principal e uma cor de destaque; o sistema MUST NOT aceitar uma cor fora da paleta.
- **FR-005**: Toda combinação possível de tema, cor principal e cor de destaque MUST manter texto e elementos legíveis, com contraste suficiente para leitura confortável, em cada um dos três temas.
- **FR-006**: O sistema MUST mostrar ao dono uma prévia da identidade (tema, nome, logo e cores) antes de salvar.
- **FR-007**: Apenas o dono MUST poder alterar a identidade visual (tema, nome, logo e cores); o barbeiro e quem não está autenticado MUST ser negados.
- **FR-008**: A identidade MUST pertencer a uma barbearia e ser intocável para usuários de outra; a escrita MUST ser só do dono da própria barbearia, e a leitura sem login MUST ficar restrita ao que FR-029 define; o isolamento MUST ser garantido no banco de dados e coberto por testes de vazamento entre barbearias.
- **FR-009**: O tema, o nome, o logo e as cores da barbearia MUST aparecer para seus usuários (dono, barbeiros e clientes) no painel de gestão e no app, substituindo os padrões do produto. A cor principal MUST ser usada em botões, links, cabeçalho e item de menu ativo; a cor de destaque, em selos, itens selecionados e realces.
- **FR-023**: As cores de estado (erro, aviso e sucesso) MUST ser sempre as do produto e MUST NOT vir da paleta nem mudar com a identidade da barbearia.
- **FR-010**: Uma barbearia sem personalização MUST aparecer com a aparência padrão do produto e o nome já cadastrado, sem logo.
- **FR-011**: Telas que antecedem o login e não pertencem ao link de uma barbearia (entrar, convite, recuperação de senha) MUST usar a aparência padrão do produto.
- **FR-029**: O sistema MUST permitir que a página do link público de uma barbearia, sem login, leia exclusivamente o tema, o nome de exibição, o logo e as cores dessa barbearia, a partir do identificador do link. Nenhum outro dado da barbearia (equipe, serviços, preços, registro de auditoria) MUST ser acessível por esse caminho, e o acesso MUST ser somente leitura.
- **FR-030**: Um identificador de link inexistente ou de barbearia desativada MUST resultar na aparência padrão do produto, sem diferença observável entre "não existe" e "desativada" e sem revelar dados de outra barbearia.
- **FR-012**: Uma alteração de identidade MUST valer para os demais usuários da barbearia na próxima tela que abrirem, sem exigir nova entrada.
- **FR-013**: O dono MUST poder remover o logo e restaurar o tema e as cores padrão; a restauração MUST NOT alterar o nome de exibição.
- **FR-024**: O sistema MUST oferecer exatamente três temas fechados (Noir, Dia e Couro), e o dono MUST escolher um deles; o tema padrão é o Noir. O sistema MUST NOT aceitar outro valor de tema.
- **FR-025**: O tema MUST alterar apenas o visual (fundo claro ou escuro, fontes, formato e estilo dos componentes). A organização das telas e das ações MUST ser a mesma nos três temas.
- **FR-026**: O claro ou escuro MUST ser definido pelo tema (Dia claro; Noir e Couro escuros); o modo do aparelho MUST NOT alterar as telas da barbearia.
- **FR-027**: Qualquer tom da paleta MUST poder ser usado como cor principal ou de destaque em qualquer um dos três temas, com a mesma regra de uso das cores definida em FR-009.
- **FR-028**: A escolha de tema e cores MUST ser única por barbearia; o sistema MUST NOT oferecer preferência de tema ou cor por usuário.
- **FR-014**: O sistema MUST registrar quem alterou a identidade, o que mudou e quando, sem guardar o conteúdo do logo nem dados pessoais no registro.
- **FR-015**: As telas de gestão do dono (Catálogo e Equipe) MUST ser desenhadas primeiro para computador: ocupar a largura da tela, listar os registros em tabela com ordenação e filtros e abrir a edição em um painel lateral que mantém a lista visível.
- **FR-016**: O Catálogo MUST permitir filtrar por situação (ativo, desativado) e por "sem executor", e ordenar por nome, categoria, duração e preço.
- **FR-017**: Os formulários de gestão MUST poder ser preenchidos e enviados só com o teclado.
- **FR-018**: Todas as telas do painel MUST continuar usáveis em tela estreita, com todo o conteúdo e todas as ações acessíveis e sem rolagem horizontal da página.
- **FR-019**: No app, o dono MUST poder: ver o catálogo e a equipe, desativar e reativar um serviço, desativar um membro da equipe e reenviar um convite. O app MUST NOT oferecer ao dono criar ou editar serviços, categorias, preços, executores, identidade visual nem convidar novas pessoas.
- **FR-020**: O barbeiro no app MUST continuar vendo somente a consulta de serviços, sem nenhuma função de gestão.
- **FR-021**: Mensagens de erro e textos exibidos ao usuário MUST estar em português do Brasil.
- **FR-022**: A sessão do dono no app MUST seguir a mesma regra do painel (12 horas sem uso); a do barbeiro MUST continuar como está.

### Key Entities *(include if feature involves data)*

- **Identidade visual da barbearia (branding)**: tema, nome de exibição, logo opcional, cor principal e cor de destaque. Pertence a uma barbearia. Sem personalização, vale a aparência padrão do produto (tema Noir).
- **Tema (theme)**: um de três estilos visuais fechados e definidos pelo produto (Noir, Dia e Couro), cada um com fundo, fontes e formato de componentes próprios. Não é editável pela barbearia além da escolha de um deles.
- **Paleta (palette)**: conjunto fixo e fechado de 8 a 12 tons definido pelo produto, cada um com nome e já validado para leitura em modo claro e escuro. Não é editável pela barbearia.
- **Logo**: imagem PNG, JPEG ou WebP, com tamanho e dimensões limitados, que pertence a uma barbearia.
- **Evento de auditoria da identidade**: registro de quem alterou o nome, o logo ou as cores, e quando, sem o conteúdo da imagem.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: O dono define nome, logo e cores e vê o resultado no painel em menos de 2 minutos, sem ajuda.
- **SC-002**: 100% das combinações possíveis de tema, cor principal e cor de destaque da paleta mantêm o texto legível.
- **SC-011**: O dono troca de tema e vê a prévia em menos de 10 segundos, e o novo tema aparece para dono, barbeiros e clientes na próxima tela que abrirem.
- **SC-003**: 100% dos envios de logo fora de formato, tamanho ou dimensões permitidos são recusados, e o logo anterior permanece.
- **SC-004**: Em testes automatizados de vazamento, 0 leituras ou escritas de uma barbearia alcançam a identidade de outra, e a leitura sem login retorna apenas tema, nome, logo e cores da barbearia do link.
- **SC-012**: Ao abrir o link de uma barbearia, a pessoa vê a identidade dela já na primeira tela, sem passar antes pela aparência padrão.
- **SC-005**: 100% das tentativas de alterar a identidade por barbeiro ou por quem não está autenticado são negadas.
- **SC-006**: Após o dono salvar, um colega que abrir uma tela nova já vê a nova identidade, sem sair e entrar de novo.
- **SC-007**: Em um monitor comum (1366 × 768), a tabela do Catálogo mostra ao menos 15 serviços sem rolagem, e editar um serviço não tira a lista da tela.
- **SC-008**: Em tela de 360 pixels de largura, nenhuma tela do painel exige rolagem horizontal da página, e toda ação continua alcançável.
- **SC-009**: O dono desativa um membro da equipe pelo app em até 3 toques a partir da tela inicial.
- **SC-010**: O dono preenche e salva um serviço novo apenas com o teclado.

## Assumptions

- A feature 003 (catálogo) e a 002 (identidade e RLS) estão disponíveis e são reaproveitadas, inclusive a regra de que só o dono escreve.
- Existe um único nome por barbearia: o "nome de exibição" é o próprio nome cadastrado na criação pela equipe do produto, agora editável pelo dono.
- Cada barbearia tem no máximo um logo e uma identidade; marcas por unidade ficam fora do escopo.
- Os limites do logo (512 KB, lado menor de 64 pixels, lado maior de 2.000 pixels) são padrões desta feature e podem ser revistos sem mudar o resto.
- SVG fica de fora por poder carregar código executável; GIF fica de fora por não ser adequado a um logo.
- O logo e a identidade são vistos por usuários autenticados da própria barbearia e pela página pública do link da barbearia (FR-029); o uso em e-mails entra quando essa feature existir.
- O identificador público do link e a página do link (cadastro e agendamento do cliente) pertencem à feature de agendamento. Esta feature entrega a leitura pública da identidade para essa página e o visual dela; a página em si não faz parte da 004.
- O cliente usa um app na loja (ADR 0003) e se cadastra sozinho, o que atende também quem quer só um serviço avulso. Ele chega à barbearia pelo link ou QR dela, ou, no app com marca própria, já dentro dela. O app do cliente, o link e o cadastro pertencem à feature de agendamento; esta feature garante que, sabida a barbearia do cliente, o tema, o nome, o logo e as cores aparecem para ele no app e na página do link.
- Os três temas (Noir, Dia e Couro) têm desenho de referência nos mockups da Rodada 2; o desenho único das telas segue o do Noir, e Dia e Couro só trocam a aparência.
- A paleta e os temas são definidos pelo produto; os tons exatos da paleta são decisão de design do plan, validados contra os três temas.
- A paleta é definida pelo produto e igual para todas as barbearias; quais são os 8 a 12 tons é decisão de design do plan. Cor livre fica fora do escopo.
- As telas de entrada, convite e recuperação de senha usam a aparência padrão, porque nelas a barbearia só é conhecida depois do login. A página do link público da barbearia é a exceção: a barbearia já é conhecida pelo link.
- As funções do dono no app são uma escolha de tela, não uma restrição de segurança: o dono continua podendo executar as mesmas ações pelo painel, e o app só não as oferece.
- A sessão do dono no app vale 12 horas sem uso, a mesma regra do painel (feature 002); o barbeiro segue com 30 dias.
- O painel é responsivo, sem aplicativo separado para o dono; o app do barbeiro é o mesmo app, com funções de gestão extras quando quem entra é o dono.
- Fora do escopo: cores livres, temas criados pela barbearia, preferência de tema ou cor por usuário, temas por unidade, fontes personalizadas, banner ou imagem de fundo, domínio próprio e e-mails com a identidade da barbearia.
