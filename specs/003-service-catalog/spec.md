# Feature Specification: Catálogo de serviços

**Feature Branch**: `003-service-catalog`

**Created**: 2026-10-22

**Status**: Draft

**Input**: User description: "Catálogo de serviços da barbearia: o dono cadastra, edita, desativa e reativa os serviços oferecidos (nome, descrição, duração, preço, categoria), define quais barbeiros executam cada serviço e, opcionalmente, preços ou durações específicos por barbeiro. Base de que a agenda e a comanda dependem. Isolado por barbearia (multi-tenant) e restrito ao dono para escrita."

## User Scenarios & Testing *(mandatory)*

Os usuários desta feature são o **dono** (quem mantém o catálogo) e o **barbeiro** (quem consulta o que oferece e por quanto). As features seguintes, agenda e comanda, dependem de saber **o que a barbearia vende**, **quanto custa**, **quanto tempo leva** e **quem executa**. Em toda operação vale o isolamento por barbearia definido na feature 002: um usuário nunca vê nem altera o catálogo de outra barbearia.

### User Story 1 - Cadastrar e manter os serviços (Priority: P1)

O dono cria as categorias da barbearia e cadastra os serviços que ela oferece, informando nome, descrição, duração, preço e categoria. Depois pode editar qualquer um desses dados, renomear e reordenar as categorias e ver a lista completa, organizada por categoria.

**Why this priority**: Sem serviços cadastrados não há o que agendar nem cobrar. É a fatia mínima que entrega valor e destrava a agenda e a comanda.

**Independent Test**: Como dono, cadastrar três serviços em duas categorias, editar o preço de um deles e conferir que a lista mostra os dados atualizados, agrupados por categoria.

**Acceptance Scenarios**:

1. **Given** um dono autenticado, **When** ele informa nome, duração, preço e categoria válidos, **Then** o serviço é criado na sua barbearia e aparece na lista.
2. **Given** um serviço existente, **When** o dono altera nome, descrição, duração, preço ou categoria, **Then** a alteração é salva e a lista reflete os novos dados.
3. **Given** dados inválidos (nome vazio ou longo demais, duração fora do passo ou do intervalo permitido, preço negativo ou acima do teto), **When** o cadastro ou a edição é enviado, **Then** nada é salvo e cada problema é indicado.
4. **Given** um serviço com o mesmo nome já existente na barbearia, **When** o dono tenta cadastrar outro com esse nome, **Then** a operação é recusada com mensagem clara.
5. **Given** um barbeiro autenticado, **When** ele tenta criar ou editar um serviço, **Then** a operação é negada.

---

### User Story 2 - Desativar e reativar serviços (Priority: P1)

O dono pode desativar um serviço que a barbearia deixou de oferecer e reativá-lo depois. Um serviço desativado deixa de ser oferecido para novos atendimentos, mas continua existindo para o histórico. Serviços nunca são apagados.

**Why this priority**: O catálogo muda com o tempo e as comandas passadas precisam continuar apontando para o serviço que foi vendido. Sem desativação, o dono só teria a opção de manter ou perder histórico.

**Independent Test**: Desativar um serviço, confirmar que ele some das opções para novos atendimentos mas continua visível na lista de desativados; reativar e confirmar que volta a ser oferecido.

**Acceptance Scenarios**:

1. **Given** um serviço ativo, **When** o dono o desativa, **Then** ele deixa de aparecer entre os serviços disponíveis para novos atendimentos e fica listado como desativado.
2. **Given** um serviço desativado, **When** o dono o reativa, **Then** ele volta a ser oferecido com os dados e vínculos que tinha.
3. **Given** um serviço já usado em atendimentos passados, **When** ele é desativado ou editado, **Then** o histórico desses atendimentos permanece intacto.
4. **Given** qualquer serviço, **When** alguém tenta apagá-lo, **Then** não existe essa operação; apenas desativar.

---

### User Story 3 - Definir quais barbeiros executam cada serviço (Priority: P2)

O dono define, para cada serviço, quais executores o realizam. Executor é qualquer usuário ativo da barbearia, barbeiro ou o próprio dono quando ele também atende. Um executor só pode ser agendado para os serviços vinculados a ele.

**Why this priority**: A agenda precisa saber quem pode fazer o quê. É necessário assim que há mais de um barbeiro com habilidades diferentes, mas o catálogo já é útil sem isso.

**Independent Test**: Vincular um serviço a dois dos três barbeiros e confirmar que a consulta de "quem executa" retorna só esses dois; desvincular um e confirmar que sai da lista.

**Acceptance Scenarios**:

1. **Given** um serviço e usuários ativos da barbearia (barbeiros ou dono), **When** o dono marca quais executam o serviço, **Then** o vínculo é salvo e a consulta de executores retorna exatamente esses barbeiros.
2. **Given** um barbeiro vinculado a um serviço, **When** o dono remove o vínculo, **Then** o barbeiro deixa de aparecer como executor e o histórico de atendimentos já feitos por ele permanece.
3. **Given** um usuário desativado, anonimizado ou de outra barbearia, **When** o dono tenta vinculá-lo, **Then** a operação é recusada.
4. **Given** um serviço ativo sem nenhum barbeiro vinculado, **When** a lista de serviços é exibida, **Then** ele é sinalizado como "sem executor" para o dono perceber a lacuna.

---

### User Story 4 - Preço e duração específicos por barbeiro (Priority: P3)

Para um barbeiro vinculado a um serviço, o dono pode, opcionalmente, definir um preço e/ou uma duração próprios, diferentes dos valores padrão do serviço. Onde não houver valor específico, vale o padrão do serviço.

**Why this priority**: Atende barbearias em que um barbeiro mais experiente cobra mais ou leva mais tempo, mas é opcional e a maioria dos serviços usa o padrão.

**Independent Test**: Definir um preço específico para um barbeiro em um serviço e confirmar que a consulta devolve o preço específico para ele e o padrão para os demais; remover o valor específico e confirmar a volta ao padrão.

**Acceptance Scenarios**:

1. **Given** um barbeiro vinculado a um serviço, **When** o dono define um preço específico, **Then** a consulta de preço e duração desse serviço para esse barbeiro devolve o valor específico e, para os demais barbeiros, o padrão.
2. **Given** um valor específico definido, **When** o dono o remove, **Then** o barbeiro volta a usar o padrão do serviço.
3. **Given** um valor específico inválido (duração fora do passo ou do intervalo permitido, preço negativo), **When** é enviado, **Then** nada é salvo.
4. **Given** uma alteração no padrão do serviço, **When** um barbeiro tem valor específico definido, **Then** o valor específico dele não é afetado.

---

### User Story 5 - Consultar o catálogo (Priority: P2)

Dono e barbeiro consultam o catálogo: serviços ativos com preço, duração e categoria. O barbeiro vê todos os serviços ativos da barbearia, com os que ele executa marcados e com os valores que valem para ele, sem poder alterar nada.

**Why this priority**: O barbeiro precisa saber o que e por quanto atender na hora do balcão; é também a leitura que a agenda e a comanda farão.

**Independent Test**: Autenticar como barbeiro, listar o catálogo e ver somente serviços ativos da própria barbearia com os valores aplicáveis a ele; tentar alterar e ser negado.

**Acceptance Scenarios**:

1. **Given** um barbeiro autenticado, **When** ele consulta o catálogo, **Then** vê todos os serviços ativos da sua barbearia, com os que ele executa marcados e, para esses, o preço e a duração específicos quando existirem; nos demais vê o padrão.
2. **Given** dois barbeiros com valores específicos diferentes no mesmo serviço, **When** cada um consulta, **Then** cada um vê o seu valor.
3. **Given** usuários de duas barbearias diferentes, **When** cada um consulta o catálogo, **Then** nenhum enxerga serviço da outra.
4. **Given** um usuário não autenticado, **When** tenta consultar, **Then** o acesso é negado.

---

### Edge Cases

- Dois cadastros simultâneos do mesmo nome na mesma barbearia: apenas um é criado, o outro é recusado como duplicado.
- Nomes iguais em barbearias diferentes são permitidos.
- Nome que difere só por maiúsculas, minúsculas ou espaços nas pontas conta como duplicado.
- Serviço gratuito (preço zero) é permitido, por exemplo cortesia; duração zero não é, nem duração que não seja múltiplo de 5 minutos ou passe de 8 horas.
- Preço e duração alterados não mudam atendimentos já concluídos (snapshot do atendimento), apenas os novos.
- Desativar um executor não apaga seus vínculos nem valores específicos; se ele for reativado, volta com eles.
- Categoria sem nenhum serviço ativo não aparece na consulta de quem atende, mas o dono ainda a vê.
- Tentar remover uma categoria que ainda tem serviços (ativos ou desativados) é recusado.
- Renomear ou reordenar uma categoria não altera os serviços que pertencem a ela.
- Desativar o último serviço de uma categoria não impede cadastrar novos nela depois.
- Tentativa de acessar ou alterar serviço por identificador de outra barbearia é tratada como inexistente.

## Clarifications

### Session 2026-10-22

- Q: O catálogo é único para a barbearia ou cada unidade tem o seu? → A: Único por barbearia, válido para todas as unidades; preço por unidade fica fora do escopo.
- Q: A categoria é texto livre ou lista gerenciada pelo dono? → A: Lista gerenciada pelo dono (criar, renomear, reordenar); cada serviço pertence a uma categoria.
- Q: A duração aceita qualquer minuto ou um passo fixo? → A: Múltiplo de 5 minutos, de 5 até 480 minutos (8 horas), tanto no padrão do serviço quanto no valor específico por barbeiro.
- Q: O dono pode ser vinculado como executor de um serviço? → A: Sim. Dono e barbeiro ativos da barbearia podem ser executores; o papel de cada um não muda.
- Q: Há limite de tamanho para nome e descrição e teto para o preço? → A: Nome até 80 caracteres, descrição até 500 e preço até R$ 10.000,00 (1.000.000 centavos), valendo também para o preço específico por executor.
- Q: O barbeiro vê o catálogo inteiro ou só os serviços em que é executor? → A: Vê todos os serviços ativos da barbearia, com os que ele executa marcados; o valor específico só se aplica onde ele é executor, nos demais vale o padrão.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST permitir ao dono cadastrar um serviço com nome (até 80 caracteres), descrição opcional (até 500 caracteres), duração, preço e categoria.
- **FR-002**: O sistema MUST permitir ao dono editar qualquer um desses dados de um serviço existente.
- **FR-003**: A duração MUST ser um número inteiro de minutos, múltiplo de 5, entre 5 e 480 (inclusive), valendo igualmente para o padrão do serviço e para o valor específico por barbeiro; o preço MUST ser um valor monetário em centavos inteiros, entre 0 e 1.000.000 (R$ 10.000,00), valendo também para o preço específico.
- **FR-004**: O nome MUST ser único por barbearia, ignorando diferença de maiúsculas, minúsculas e espaços nas pontas.
- **FR-005**: O sistema MUST permitir ao dono desativar e reativar um serviço; um serviço NUNCA é apagado.
- **FR-006**: Um serviço desativado MUST deixar de ser oferecido para novos atendimentos e continuar disponível para o histórico e para reativação.
- **FR-007**: O sistema MUST permitir ao dono definir quais usuários ativos da barbearia (barbeiros ou o próprio dono) executam cada serviço e remover esses vínculos.
- **FR-008**: O sistema MUST recusar o vínculo de usuário desativado, anonimizado ou de outra barbearia.
- **FR-009**: O sistema MUST permitir ao dono definir, por vínculo barbeiro-serviço, um preço e/ou uma duração específicos, e removê-los; na ausência do valor específico vale o padrão do serviço.
- **FR-010**: O sistema MUST oferecer uma consulta que, dado um serviço e um barbeiro, devolve o preço e a duração aplicáveis (específicos ou padrão), para uso da agenda e da comanda.
- **FR-011**: O sistema MUST oferecer uma consulta de quem executa cada serviço.
- **FR-012**: Dono e barbeiro MUST poder consultar o catálogo de serviços ativos da própria barbearia, o barbeiro vendo todos eles com os seus marcados; apenas o dono MUST poder criar, editar, desativar, reativar e alterar vínculos e valores específicos.
- **FR-013**: Todo dado do catálogo MUST pertencer a uma barbearia e ser invisível e intocável para usuários de outra; o isolamento MUST ser garantido no banco de dados, não só na aplicação, e coberto por testes de vazamento entre barbearias.
- **FR-014**: O sistema MUST registrar quem criou, editou, desativou ou reativou um serviço e quando, e vínculos e valores específicos alterados.
- **FR-015**: Alterações em preço, duração ou vínculos MUST valer apenas para novos atendimentos; atendimentos já concluídos mantêm os valores do momento em que foram concluídos.
- **FR-016**: Serviços MUST ser organizados por categoria, e a lista MUST poder ser exibida agrupada por ela.
- **FR-017**: O catálogo MUST ser único por barbearia, valendo para todas as suas unidades, com os mesmos serviços, preços e durações em todas; preço ou disponibilidade por unidade ficam fora do escopo.
- **FR-018**: A categoria MUST ser gerenciada pelo dono como uma lista própria da barbearia: ele pode criar, renomear e reordenar categorias, e cada serviço pertence a exatamente uma categoria. O nome da categoria é único por barbearia (mesma regra de comparação do FR-004), e uma categoria que ainda tem serviços não pode ser removida.
- **FR-019**: Mensagens de erro e textos exibidos ao usuário MUST estar em português do Brasil.

### Key Entities *(include if feature involves data)*

- **Serviço (service)**: o que a barbearia vende. Tem nome, descrição opcional, duração padrão em minutos, preço padrão em centavos, categoria e situação (ativo ou desativado). Pertence a uma barbearia.
- **Categoria (service category)**: agrupamento de serviços, como cabelo, barba e combos. Lista gerenciada pelo dono, com nome único por barbearia e ordem de exibição própria.
- **Vínculo barbeiro-serviço (barber service)**: indica que um barbeiro executa um serviço; pode carregar preço e/ou duração específicos opcionais. Relaciona um serviço a um usuário executor (barbeiro ou dono), ambos da mesma barbearia.
- **Evento de auditoria**: registro de quem alterou o catálogo e quando; reaproveita a trilha de eventos de segurança da feature 002 quando couber.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: O dono cadastra um serviço completo em menos de 1 minuto, e monta um catálogo inicial de 15 serviços em menos de 15 minutos.
- **SC-002**: Em testes automatizados de vazamento, 0 operações de leitura ou escrita de uma barbearia alcançam o catálogo de outra.
- **SC-003**: 100% das tentativas de alteração do catálogo por barbeiros ou usuários não autenticados são negadas.
- **SC-004**: Em 100% dos casos, a consulta de preço e duração para um barbeiro devolve o valor específico quando existir e o padrão caso contrário.
- **SC-005**: Desativar e reativar um serviço não perde nenhum dado nem vínculo: após o ciclo, o serviço e seus vínculos estão idênticos ao estado anterior.
- **SC-006**: A lista do catálogo com 100 serviços é exibida em menos de 2 segundos em conexão móvel comum.
- **SC-007**: Nenhuma alteração de catálogo modifica retroativamente valores de atendimentos já concluídos.

## Assumptions

- A feature 002 (barbearia, usuários dono/barbeiro, sessão e isolamento por RLS) está disponível e é reaproveitada, inclusive a trilha de eventos.
- Apenas o dono escreve no catálogo; o barbeiro só lê. Não há papel intermediário nesta feature.
- Serviços não são apagados nunca; a desativação cobre a necessidade de "remover" do dia a dia.
- A duração é única por serviço (sem etapas ou tempos de preparo separados); a duração define o bloco de agenda e os minutos do rateio em features futuras.
- Valores monetários seguem a constituição: centavos inteiros, sem ponto flutuante.
- Não há importação em massa nem catálogo inicial padrão nesta feature; o dono cadastra os serviços manualmente.
- Fora do escopo: produtos (venda de itens físicos), pacotes e combos com preço próprio, regras de elegibilidade por plano do clube, comissão por serviço, fotos e promoções. Cada um é spec própria.
- O consumo do catálogo pela agenda e pela comanda (agendamento, snapshot na conclusão) pertence às features dessas áreas; esta feature entrega o cadastro e as consultas que elas usarão.
- Tela de gestão no admin web para o dono e consulta no app do barbeiro; o link público de agendamento passa a ler o catálogo só quando a feature da agenda existir.
