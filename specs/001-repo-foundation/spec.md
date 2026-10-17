# Feature Specification: Fundação do repositório

**Feature Branch**: `001-repo-foundation`

**Created**: 2026-10-17

**Status**: Draft

**Input**: User description: "Fundação do repositório. Preparar a base para todas as features seguintes, sem nenhuma regra de negócio. Ao final, um desenvolvedor clona o repositório, roda um comando de instalação e um de testes, e tudo passa. Escopo: monorepo com os espaços apps/api, apps/admin, apps/booking, apps/barber, packages/domain, packages/contracts e packages/ui, conforme a constitution; packages/domain criado vazio, com execução de testes configurada e um teste de exemplo; ambiente local com banco de dados e fila sobem por um único comando; lint, formatação e verificação de tipos em todo o monorepo; pipeline de integração contínua que roda lint, tipos e testes a cada push; README com os passos para rodar o projeto; todos os comandos de desenvolvimento funcionam igualmente em Windows (PowerShell) e Linux. Fora do escopo: qualquer tela, endpoint, entidade de negócio ou autenticação."

## User Scenarios & Testing *(mandatory)*

Os "usuários" desta feature são os desenvolvedores do projeto (atuais e futuros) e o processo de revisão de PRs exigido pela constitution.

### User Story 1 - Clonar, instalar e testar (Priority: P1)

Um desenvolvedor que acabou de entrar no projeto clona o repositório em uma máquina Windows (PowerShell) ou Linux, executa um único comando de instalação e um único comando de testes, e todos os testes passam sem nenhum passo manual adicional além dos pré-requisitos listados no README.

**Why this priority**: É o objetivo declarado da feature e a condição mínima para que qualquer feature seguinte (em especial o domínio em TDD estrito) possa começar.

**Independent Test**: Em uma máquina limpa com apenas os pré-requisitos do README instalados, clonar o repositório, rodar o comando de instalação e o comando de testes; o resultado deve ser sucesso, com o teste de exemplo de `packages/domain` executado e aprovado.

**Acceptance Scenarios**:

1. **Given** uma máquina Windows com apenas os pré-requisitos do README, **When** o desenvolvedor clona o repositório e roda o comando de instalação, **Then** a instalação conclui sem erros e sem exigir comandos específicos de outro sistema operacional.
2. **Given** a instalação concluída, **When** o desenvolvedor roda o comando de testes na raiz, **Then** os testes de todos os espaços que possuem testes são executados e o teste de exemplo de `packages/domain` passa.
3. **Given** uma máquina Linux com os mesmos pré-requisitos, **When** os mesmos dois comandos são executados, **Then** o resultado é idêntico ao do Windows.

---

### User Story 2 - Verificação automática a cada push (Priority: P1)

A cada push para o repositório remoto, a integração contínua executa lint, verificação de formatação, verificação de tipos e testes em todo o monorepo, e informa claramente se passou ou falhou, atendendo à exigência da constitution de que todo PR tenha testes, lint e type-check sem erros.

**Why this priority**: Sem essa barreira, a qualidade das features seguintes depende da disciplina individual; a constitution torna essas verificações obrigatórias em todo PR.

**Independent Test**: Fazer push de um commit válido e observar a pipeline passar; fazer push de um commit com um erro proposital de tipo, de lint ou um teste falhando e observar a pipeline falhar indicando a etapa responsável.

**Acceptance Scenarios**:

1. **Given** um commit sem problemas, **When** ele é enviado ao repositório remoto, **Then** a pipeline executa lint, formatação, tipos e testes e termina com sucesso.
2. **Given** um commit com um erro de tipo em qualquer espaço do monorepo, **When** ele é enviado, **Then** a pipeline falha e indica a etapa de verificação de tipos como causa.
3. **Given** um commit com um teste falhando, **When** ele é enviado, **Then** a pipeline falha e indica a etapa de testes como causa.
4. **Given** um commit com código fora do padrão de formatação ou violando regras de lint, **When** ele é enviado, **Then** a pipeline falha e indica a etapa correspondente.

---

### User Story 3 - Subir a infraestrutura local com um comando (Priority: P2)

O desenvolvedor sobe o banco de dados e a fila locais com um único comando, e os derruba com outro, sem instalar esses serviços diretamente na máquina.

**Why this priority**: Ainda não há código que use banco ou fila nesta feature, mas as próximas features (tenancy, ledger, webhooks) dependem disso; deixar pronto agora evita que cada feature resolva o ambiente de um jeito.

**Independent Test**: Rodar o comando de subida, verificar que banco e fila aceitam conexão nas portas documentadas no README, rodar o comando de parada e verificar que os serviços foram encerrados.

**Acceptance Scenarios**:

1. **Given** os pré-requisitos do README instalados, **When** o desenvolvedor roda o comando de subida da infraestrutura, **Then** banco de dados e fila ficam disponíveis e aceitando conexões nos endereços documentados.
2. **Given** a infraestrutura em execução, **When** o desenvolvedor roda o comando de parada, **Then** os serviços são encerrados, preservando os dados locais por padrão.
3. **Given** a infraestrutura já em execução, **When** o comando de subida é executado novamente, **Then** ele conclui sem erro e sem duplicar serviços.

---

### User Story 4 - Padrões de código aplicados localmente (Priority: P2)

O desenvolvedor roda lint, formatação e verificação de tipos localmente, com os mesmos comandos e as mesmas regras que a integração contínua usa, e consegue corrigir automaticamente o que for corrigível (formatação e regras de lint auto-corrigíveis).

**Why this priority**: Evita o ciclo de descobrir problemas só na pipeline; garante paridade entre local e CI.

**Independent Test**: Introduzir um problema de formatação e um erro de tipo, rodar os comandos locais, verificar que ambos são detectados; rodar o comando de correção e verificar que a formatação foi corrigida.

**Acceptance Scenarios**:

1. **Given** um arquivo mal formatado, **When** o desenvolvedor roda o comando de formatação, **Then** o arquivo é reformatado de acordo com o padrão do projeto.
2. **Given** um erro de tipo em qualquer espaço, **When** o desenvolvedor roda a verificação de tipos na raiz, **Then** o erro é reportado com arquivo e linha.
3. **Given** o mesmo código, **When** as verificações são rodadas localmente e na CI, **Then** os resultados são os mesmos.

---

### User Story 5 - README como ponto de entrada (Priority: P3)

Um desenvolvedor novo encontra no README os pré-requisitos, os comandos de instalação, testes, lint, formatação, tipos, subida e parada da infraestrutura local, e uma visão da organização do monorepo.

**Why this priority**: Viabiliza as demais histórias para quem nunca viu o projeto, mas depende delas existirem.

**Independent Test**: Uma pessoa que não participou da feature segue apenas o README, em Windows e em Linux, e chega a testes passando e infraestrutura no ar sem pedir ajuda.

**Acceptance Scenarios**:

1. **Given** um desenvolvedor sem contexto do projeto, **When** segue o README do início ao fim, **Then** chega a testes passando e infraestrutura local disponível sem consultar outra fonte.
2. **Given** o README, **When** o desenvolvedor procura o propósito de cada espaço do monorepo, **Then** encontra uma descrição de uma linha para cada um.

---

### Edge Cases

- Portas do banco ou da fila já ocupadas na máquina: o comando de subida falha com mensagem que identifica a porta em conflito, e o README explica como alterá-la.
- Pré-requisito ausente ou em versão incompatível (por exemplo, runtime em versão errada): a instalação falha cedo com mensagem indicando a versão esperada.
- Diferenças de fim de linha entre Windows e Linux: o repositório normaliza fins de linha para que a verificação de formatação não falhe só por ter sido feito o checkout em Windows.
- Caminhos com espaços ou separadores de diretório diferentes: nenhum comando de desenvolvimento depende de sintaxe de shell específica de um sistema operacional.
- Espaços sem código ainda (apps e packages vazios): lint, tipos e testes não falham por ausência de arquivos; espaços sem testes são ignorados pelo comando de testes sem gerar erro.
- Comando de testes rodado sem a infraestrutura local no ar: passa, pois nesta feature nenhum teste depende de banco ou fila.
- Infraestrutura local parada e reiniciada: os dados locais persistem entre reinícios até que o desenvolvedor peça explicitamente para apagá-los.

## Requirements *(mandatory)*

### Functional Requirements

**Estrutura do monorepo**

- **FR-001**: O repositório MUST ser organizado como monorepo contendo exatamente os espaços `apps/api`, `apps/admin`, `apps/booking`, `apps/barber`, `packages/domain`, `packages/contracts` e `packages/ui`, conforme a constitution.
- **FR-002**: Cada espaço MUST ser reconhecido pelo monorepo como unidade independente, participando dos comandos de lint, formatação, tipos e testes executados na raiz.
- **FR-003**: Os espaços MUST NOT conter telas, endpoints, entidades de negócio, autenticação ou qualquer regra de negócio; apenas o mínimo necessário para existirem e passarem nas verificações.
- **FR-004**: `packages/domain` MUST ter execução de testes configurada e exatamente um teste de exemplo que passa, sem dependências de framework, banco de dados, rede ou relógio do sistema (princípio IV).
- **FR-005**: A verificação de tipos MUST usar o modo estrito em todos os espaços do monorepo.

**Comandos de desenvolvimento**

- **FR-006**: MUST existir um único comando, executado na raiz, que instala todas as dependências do monorepo.
- **FR-007**: MUST existir um único comando, executado na raiz, que executa os testes de todos os espaços.
- **FR-008**: MUST existir comandos na raiz para: lint, verificação de formatação, aplicação de formatação e verificação de tipos, cobrindo todo o monorepo.
- **FR-009**: Todos os comandos de desenvolvimento (instalar, rodar, testar, lint, formatar, tipos, subir e parar infraestrutura) MUST funcionar de forma idêntica no Windows (PowerShell) e no Linux, sem variantes específicas por sistema operacional.
- **FR-010**: Os comandos MUST retornar código de saída diferente de zero quando houver falha, para que a integração contínua e scripts possam detectá-la.
- **FR-011**: O repositório MUST fixar as versões dos pré-requisitos (runtime e gerenciador de pacotes) e as versões das dependências instaladas, de modo que duas instalações a partir do mesmo commit sejam equivalentes.
- **FR-012**: O repositório MUST normalizar fins de linha para que o mesmo conteúdo produza os mesmos resultados de formatação e lint em Windows e Linux.

**Ambiente local**

- **FR-013**: MUST existir um único comando que sobe localmente o banco de dados e a fila exigidos pela constitution, sem que o desenvolvedor instale esses serviços diretamente na máquina.
- **FR-014**: MUST existir um comando para parar a infraestrutura local preservando os dados, e um comando separado e explícito para apagar os dados locais.
- **FR-015**: Endereços, portas e credenciais locais MUST ter valores padrão funcionais, ser documentados e poder ser alterados por configuração local sem editar arquivos versionados.
- **FR-016**: Credenciais reais ou segredos MUST NOT ser versionados; apenas valores de exemplo para uso local.

**Integração contínua**

- **FR-017**: A integração contínua MUST executar, a cada push para qualquer branch, as etapas de instalação, lint, verificação de formatação, verificação de tipos e testes em todo o monorepo, em ambiente Linux.
- **FR-018**: A integração contínua MUST usar os mesmos comandos documentados para uso local.
- **FR-019**: Falha em qualquer etapa MUST fazer a execução falhar, identificando a etapa que falhou.

**Documentação**

- **FR-020**: O README MUST conter: pré-requisitos com versões, comandos de instalação, testes, lint, formatação, tipos, subida, parada e limpeza da infraestrutura local, e uma descrição de uma linha de cada espaço do monorepo.
- **FR-021**: O README MUST incluir orientação para os casos de borda conhecidos (porta ocupada, versão de runtime incompatível).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Um desenvolvedor sem contexto prévio, seguindo apenas o README, sai do clone até os testes passando em até 15 minutos (excluindo tempo de download dos pré-requisitos), tanto em Windows quanto em Linux.
- **SC-002**: O fluxo "clonar → instalar → testar" é concluído com sucesso com no máximo 2 comandos após o clone, em 100% das tentativas em Windows e em Linux.
- **SC-003**: A infraestrutura local (banco e fila) fica disponível com 1 comando em até 2 minutos após os componentes estarem baixados.
- **SC-004**: 100% dos pushes executam a pipeline de verificação, e um erro proposital de lint, formatação, tipo ou teste faz a pipeline falhar em 100% dos casos.
- **SC-005**: A pipeline de verificação completa termina em até 10 minutos no estado inicial do repositório.
- **SC-006**: Nenhum comando documentado no README exige uma versão diferente por sistema operacional (0 comandos com variante Windows/Linux).

## Assumptions

- Os pré-requisitos que o desenvolvedor instala por conta própria são: o runtime da linguagem do projeto, o gerenciador de pacotes indicado e um executor de contêineres; o README lista as versões exatas.
- O banco de dados e a fila são os definidos na constitution (PostgreSQL e Redis); nesta feature eles apenas sobem e aceitam conexão, sem esquemas, migrations ou filas configuradas, pois a ferramenta de migrations ainda é uma decisão aberta por ADR.
- "Rodar" nesta feature significa subir a infraestrutura local e executar as verificações; não há aplicação para executar, já que telas e endpoints estão fora do escopo. Os apps existem como espaços mínimos (esqueleto) sem servidor ou interface funcional.
- A plataforma de integração contínua é a do provedor onde o repositório remoto está hospedado; a escolha concreta é registrada no plan/ADR, já que hospedagem e CI/CD são decisões abertas na constitution.
- A pipeline roda em pushes para qualquer branch; regras de proteção de branch e obrigatoriedade de aprovação em PR ficam fora desta feature.
- Testes de contrato, testes de vazamento entre tenants e golden tests exigidos pela constitution não se aplicam ainda, pois não há contratos, entidades nem domínio; serão introduzidos pelas features correspondentes.
- Hooks locais de pré-commit são opcionais e não fazem parte do escopo obrigatório; a barreira obrigatória é a integração contínua.
