# Feature Specification: Barbearia, usuários e autenticação

**Feature Branch**: `002-tenant-auth`

**Created**: 2026-10-21

**Status**: Draft

**Input**: User description: "Cadastro de barbearia (tenant), usuários (dono e barbeiro) e autenticação (login). Base multi-tenant de que agenda, serviços e clientes dependem."

## Clarifications

### Session 2026-10-21

- Q: Por quanto tempo uma sessão sem uso continua válida antes de pedir login de novo? → A: Por papel: dono 12 horas, barbeiro 30 dias de inatividade.
- Q: O dono pode adicionar outros donos ou promover um barbeiro a dono? → A: O dono pode convidar outros donos; o papel é definido no convite e não muda depois.
- Q: Por quantos dias o link de convite continua válido antes de expirar? → A: 7 dias. O link de recuperação de senha vale 1 hora (adotado como padrão, não contestado).
- Q: Qual o tamanho mínimo da senha que o usuário pode definir? → A: 8 caracteres, além da rejeição de senhas óbvias.
- Q: Depois de quantas tentativas de login erradas seguidas a conta é bloqueada, e por quanto tempo? → A: 5 tentativas seguidas, bloqueio de 15 minutos.

## User Scenarios & Testing *(mandatory)*

Os usuários desta feature são a **equipe do produto** (quem provisiona as barbearias), o **dono** da barbearia (quem a administra) e o **barbeiro** (quem trabalha nela). As features seguintes (cadastros, agenda, comanda, clube) dependem de saber, em toda requisição, **quem** está agindo e **de qual barbearia** ele é.

### User Story 1 - Provisionar a barbearia e dar acesso ao dono (Priority: P1)

A equipe do produto cadastra uma barbearia nova informando o nome, a unidade inicial (com fuso horário) e o nome e e-mail do dono. O dono recebe um convite com link, define a própria senha e entra no sistema, vendo somente a sua barbearia.

**Why this priority**: Sem uma barbearia e um dono autenticável, nenhuma outra feature tem onde existir. É a fatia mínima que entrega valor.

**Independent Test**: Provisionar uma barbearia nova do zero, aceitar o convite como dono, sair e entrar novamente com as mesmas credenciais; o dono vê somente a sua barbearia e a unidade inicial.

**Acceptance Scenarios**:

1. **Given** a equipe do produto, **When** ela informa nome da barbearia, nome e fuso horário da unidade e nome e e-mail do dono, **Then** a barbearia, a unidade inicial e o usuário dono (pendente de convite) são criados e o convite é enviado.
2. **Given** um convite válido, **When** o dono define uma senha que atende às regras, **Then** o acesso é ativado e ele fica autenticado.
3. **Given** um e-mail já usado por outro usuário, **When** a equipe tenta provisionar uma barbearia com ele, **Then** a operação é recusada com mensagem clara e nada é criado.
4. **Given** dados obrigatórios ausentes ou inválidos (e-mail malformado, fuso inexistente), **When** o cadastro é enviado, **Then** nada é criado e cada problema é indicado.
5. **Given** uma pessoa sem vínculo com a equipe do produto, **When** ela tenta provisionar uma barbearia, **Then** a operação é negada.

---

### User Story 2 - Entrar e sair do sistema (Priority: P1)

Um usuário cadastrado (dono ou barbeiro) entra com suas credenciais e passa a acessar apenas o que o seu papel permite, dentro da sua barbearia. Ele pode sair a qualquer momento, e a sessão deixa de valer.

**Why this priority**: Toda funcionalidade protegida depende de identificar quem está agindo. Sem login confiável não há como garantir o isolamento entre barbearias.

**Independent Test**: Entrar com credenciais válidas e acessar uma área protegida; sair e confirmar que a mesma área volta a exigir login; tentar entrar com senha errada e ser recusado.

**Acceptance Scenarios**:

1. **Given** um usuário ativo, **When** ele informa e-mail e senha corretos, **Then** ele é autenticado e identificado com seu papel e sua barbearia.
2. **Given** credenciais incorretas, **When** o usuário tenta entrar, **Then** o acesso é negado com mensagem genérica que não revela se o e-mail existe.
3. **Given** um usuário autenticado, **When** ele sai, **Then** a sessão é encerrada e acessar uma área protegida exige novo login.
4. **Given** várias tentativas seguidas de login com senha errada para a mesma conta, **When** o limite for excedido, **Then** novas tentativas são bloqueadas por 15 minutos.
5. **Given** um usuário desativado, **When** ele tenta entrar, **Then** o acesso é negado.

---

### User Story 3 - Isolamento entre barbearias (Priority: P1)

Cada barbearia enxerga e altera somente os seus próprios dados. Um usuário da barbearia A nunca vê, lista, altera nem sabe da existência de dados da barbearia B, mesmo que tente acessar por identificadores de outra barbearia.

**Why this priority**: É o princípio I da constitution (multi-tenancy obrigatório). Um vazamento entre barbearias é inaceitável e caro de corrigir depois.

**Independent Test**: Com duas barbearias cadastradas, autenticar um usuário da A e tentar ler e alterar usuários e dados da B por todos os caminhos disponíveis; todas as tentativas falham como se o dado não existisse.

**Acceptance Scenarios**:

1. **Given** duas barbearias com usuários, **When** um usuário da A lista usuários, **Then** vê apenas os da A.
2. **Given** o identificador de um usuário da B, **When** um usuário da A tenta consultá-lo ou alterá-lo, **Then** a resposta é a mesma de um registro inexistente.
3. **Given** uma operação sem barbearia identificada no contexto, **When** ela tenta acessar dados de negócio, **Then** é recusada.

---

### User Story 4 - Dono adiciona e gerencia a equipe (Priority: P2)

O dono dá acesso a cada barbeiro da equipe e a outros donos (sócios) e pode desativar qualquer usuário quando ele sair da barbearia. O barbeiro só enxerga o que o seu papel permite.

**Why this priority**: O app do barbeiro e as features de agenda, comanda e comissão dependem de barbeiros com conta própria; porém o dono já consegue operar sozinho sem isso.

**Independent Test**: Como dono, adicionar um barbeiro, entrar com a conta dele e confirmar acesso restrito; desativá-lo e confirmar que perde o acesso.

**Acceptance Scenarios**:

1. **Given** um dono autenticado, **When** ele adiciona um barbeiro com nome e e-mail, **Then** o barbeiro passa a existir na barbearia do dono e recebe um convite com link de uso único para definir a própria senha.
2. **Given** um barbeiro autenticado, **When** ele tenta convidar, desativar ou reativar outros usuários, **Then** a ação é negada.
3. **Given** um barbeiro ativo com sessão aberta, **When** o dono o desativa, **Then** a sessão dele deixa de valer e novos logins são negados.
4. **Given** um convite expirado ou já usado, **When** o barbeiro tenta usá-lo, **Then** o acesso é recusado e o dono pode reenviar um novo convite.
5. **Given** um barbeiro desativado, **When** o dono o reativa, **Then** ele volta a acessar com as mesmas credenciais.
6. **Given** que a barbearia tem apenas um dono ativo, **When** alguém tenta desativá-lo, **Then** a ação é recusada.
7. **Given** um dono autenticado, **When** ele convida uma pessoa como dono, **Then** ela recebe o convite e, ao aceitar, passa a ter o papel de dono, que não pode ser alterado depois.

---

### User Story 5 - Recuperar o acesso quando esquecer a senha (Priority: P2)

Um usuário que esqueceu a senha consegue definir uma nova de forma segura, sem ajuda de terceiros.

**Why this priority**: Sem isso, cada senha esquecida vira chamado de suporte. Não bloqueia as demais features.

**Independent Test**: Solicitar a recuperação para um e-mail cadastrado, concluir pelo link recebido, entrar com a nova senha e confirmar que a antiga não funciona.

**Acceptance Scenarios**:

1. **Given** um e-mail cadastrado, **When** o usuário solicita a recuperação, **Then** recebe uma mensagem com um link de uso único e prazo de validade.
2. **Given** um e-mail não cadastrado, **When** a recuperação é solicitada, **Then** a resposta exibida é a mesma, sem revelar se o e-mail existe.
3. **Given** um link já usado ou expirado, **When** o usuário tenta usá-lo, **Then** a troca é recusada.
4. **Given** a senha trocada com sucesso, **When** havia sessões abertas daquele usuário, **Then** elas são encerradas.

---

### Edge Cases

- Dois provisionamentos simultâneos com o mesmo e-mail: no máximo um é criado, o outro recebe o erro de e-mail em uso.
- Convite enviado para um e-mail digitado errado: o dono pode reenviar para o e-mail corrigido enquanto o convite não foi aceito.
- Uma falha no meio do cadastro (por exemplo, a barbearia é criada, mas o dono não): nada fica criado pela metade.
- Um e-mail com letras maiúsculas e minúsculas diferentes é tratado como o mesmo e-mail.
- Sessão expirada no meio de uma ação: a ação não é concluída e o usuário é levado a entrar de novo.
- Tentativa de se desativar (dono sobre si mesmo) quando é o único dono: recusada.
- Troca de senha ou desativação com várias sessões abertas em dispositivos diferentes: todas deixam de valer.
- Nomes de barbearia repetidos entre barbearias diferentes são permitidos; a identidade é a barbearia, não o nome.

## Requirements *(mandatory)*

### Functional Requirements

**Barbearia e unidade**

- **FR-001**: O sistema MUST permitir que a equipe do produto cadastre uma barbearia (tenant) com nome, criando junto uma **unidade inicial** com nome e fuso horário e o **usuário dono**. Não há autocadastro público de barbearias.
- **FR-002**: Toda barbearia MUST ter ao menos uma unidade, e a hierarquia Barbearia → Unidades MUST existir desde esta feature, ainda que a gestão de múltiplas unidades fique fora do escopo.
- **FR-003**: O fuso horário MUST ser definido por unidade, e as datas MUST ser guardadas de forma independente do fuso de exibição.

**Usuários e papéis**

- **FR-004**: O sistema MUST ter os papéis **dono** e **barbeiro**, e todo usuário MUST ter exatamente um papel e pertencer a uma barbearia.
- **FR-005**: Toda barbearia MUST ter ao menos um dono ativo; o sistema MUST impedir desativar o último dono ativo. O papel de um usuário é definido no convite e MUST NOT ser alterado depois; trocar de papel exige outro convite com outro e-mail.
- **FR-006**: O e-mail MUST ser único no sistema, sem distinguir maiúsculas de minúsculas.
- **FR-007**: O dono MUST poder convidar, desativar e reativar barbeiros e outros donos da sua barbearia; o barbeiro MUST NOT poder fazê-lo.
- **FR-008**: Desativar um usuário MUST encerrar suas sessões abertas e impedir novos logins, preservando o registro e o histórico.
- **FR-009**: O primeiro acesso de qualquer usuário (dono ou barbeiro) MUST ocorrer por **convite com link de uso único e validade de 7 dias**, pelo qual a própria pessoa define a senha. Ninguém além dela MUST conhecer a senha. O convite MUST poder ser reenviado enquanto não aceito.

**Autenticação e sessão**

- **FR-010**: O sistema MUST autenticar usuários por e-mail e senha.
- **FR-011**: Senhas MUST ser armazenadas de forma que não possam ser recuperadas em texto claro e MUST seguir regras mínimas de força (mínimo de 8 caracteres e rejeição de senhas óbvias).
- **FR-012**: O sistema MUST identificar, a cada requisição autenticada, o usuário, o papel e a barbearia, e MUST negar acesso a áreas protegidas sem sessão válida.
- **FR-013**: Sessões MUST expirar após inatividade: **12 horas para o dono e 30 dias para o barbeiro**. O usuário MUST poder encerrar a própria sessão (sair).
- **FR-014**: Mensagens de falha de login e de recuperação de senha MUST NOT revelar se um e-mail está cadastrado.
- **FR-015**: Tentativas repetidas de login com falha MUST ser limitadas por conta e por origem, com bloqueio de 15 minutos após 5 tentativas seguidas com falha na mesma conta.
- **FR-016**: O sistema MUST permitir recuperar a senha por link de uso único e com validade de 1 hora; trocar a senha MUST encerrar as demais sessões do usuário.

**Isolamento entre barbearias**

- **FR-017**: Todo dado de negócio MUST pertencer a uma barbearia, e nenhuma leitura ou escrita MUST ocorrer sem a barbearia identificada no contexto.
- **FR-018**: Um usuário MUST acessar apenas dados da própria barbearia; ao referenciar dado de outra barbearia, a resposta MUST ser indistinguível da de um registro inexistente.
- **FR-019**: O isolamento MUST ser garantido na camada de dados e não apenas na lógica da aplicação, e MUST ser coberto por testes automatizados de vazamento entre barbearias.

**Privacidade e auditoria**

- **FR-020**: O sistema MUST registrar eventos de segurança (provisionamento de barbearia, convite enviado e aceito, login com sucesso e falha, logout, troca e recuperação de senha, desativação e reativação de usuário) com quem executou e quando, sem gravar senhas nem dados pessoais em texto claro nos logs.
- **FR-021**: Os dados pessoais coletados MUST se limitar ao necessário: nome e e-mail do usuário; nome da barbearia e da unidade.
- **FR-024**: A pedido do titular, o sistema MUST permitir **anonimizar** de forma irreversível o nome e o e-mail de um usuário, mantendo o identificador interno e os eventos de segurança, que deixam de conter dado pessoal. O usuário MUST ser desativado antes da anonimização, e seu e-mail MUST ficar livre para novo cadastro. O último dono ativo de uma barbearia MUST NOT ser anonimizado. A execução cabe à equipe do produto e é restrita a ela, como em FR-022.

**Cadastro da barbearia**

- **FR-022**: A operação de provisionar barbearias MUST ser restrita à equipe do produto e MUST NOT estar acessível a donos nem a barbeiros.

**Usuário em mais de uma barbearia**

- **FR-023**: Cada e-mail MUST pertencer a exatamente uma barbearia. Ter acesso a mais de uma barbearia com o mesmo e-mail fica fora do escopo.

### Key Entities

- **Barbearia (tenant)**: o cliente do SaaS. Tem nome e uma ou mais unidades. É a fronteira de isolamento de todos os dados de negócio.
- **Unidade**: local físico de atendimento de uma barbearia. Tem nome e fuso horário. Toda barbearia tem ao menos uma.
- **Usuário**: pessoa que acessa o sistema. Tem nome, e-mail único, papel (dono ou barbeiro), situação (ativo ou desativado) e pertence a uma barbearia.
- **Papel**: define o que o usuário pode fazer. Nesta feature: dono (administra a barbearia e a equipe) e barbeiro (acesso restrito).
- **Sessão**: período autenticado de um usuário, com expiração por inatividade e encerrável por logout, desativação ou troca de senha.
- **Convite**: autorização de uso único e prazo limitado para o primeiro acesso, em que a pessoa define a própria senha.
- **Credencial de recuperação**: autorização de uso único e prazo curto para definir nova senha.
- **Evento de segurança**: registro de quem fez o quê e quando em ações de acesso e de gestão de usuários. Sobrevive à anonimização do usuário, referenciando-o apenas pelo identificador interno.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A equipe do produto provisiona uma barbearia em menos de 3 minutos e o dono, a partir do convite, define a senha e entra em menos de 3 minutos, sem ajuda.
- **SC-002**: Um usuário já cadastrado entra no sistema em menos de 30 segundos.
- **SC-003**: Em testes com duas ou mais barbearias, 100% das tentativas de ler ou alterar dados de outra barbearia são negadas, por todos os caminhos de acesso existentes.
- **SC-004**: Um usuário desativado perde o acesso em até 1 minuto, inclusive com sessões abertas.
- **SC-005**: Nenhuma resposta de login ou de recuperação de senha permite descobrir se um e-mail está cadastrado.
- **SC-006**: 100% das ações de segurança listadas em FR-020 aparecem na trilha de auditoria com autor e horário.
- **SC-007**: O dono adiciona um barbeiro e o barbeiro, a partir do convite, consegue entrar pela primeira vez em menos de 5 minutos.
- **SC-008**: Após a anonimização de um usuário, 0% das telas, respostas e logs permitem recuperar seu nome ou e-mail originais, e a trilha de auditoria continua íntegra.

## Assumptions

- A autenticação é por e-mail e senha; login social e autenticação em dois fatores ficam fora desta feature.
- Os papéis são apenas dono e barbeiro. Outros papéis (recepção, gerente) ficam para features futuras, mas a estrutura de papéis deve comportar sua adição.
- Todo dono da barbearia pode administrar a equipe; permissões finas por tela ou por dado dependem das features que os criarem.
- O cadastro cria uma única unidade; criar, editar e desativar unidades adicionais fica fora do escopo, embora o modelo já suporte várias.
- O envio de e-mails (convite e recuperação de senha) usa um provedor externo, a ser decidido no plan.
- Cliente final (quem agenda pelo link público) não tem conta nesta feature.
- A equipe do produto é um ator interno restrito (por exemplo, o time de desenvolvimento no início); a forma de acessá-la (ferramenta interna ou procedimento operacional) é decisão do plan. Uma tela de administração da plataforma fica fora do escopo.
- O banco de dados e a ferramenta de migrations são decisões técnicas abertas na constitution e devem estar definidas por ADR antes do plan desta feature.
- Dependência: a fundação do repositório (001) está concluída.
- Anonimização de dados de usuário (FR-024) é um procedimento operacional da equipe do produto, sem tela de autoatendimento. O prazo para atender o pedido do titular não foi definido e deve ser tratado como decisão de negócio antes de haver cliente real.
- Fora do escopo: autocadastro público de barbearias, usuário com acesso a mais de uma barbearia, cadastro de serviços, barbeiros com agenda e horários, clientes, planos, comandas e qualquer regra financeira.
