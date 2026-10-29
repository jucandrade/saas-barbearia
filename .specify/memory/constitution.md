<!--
Sync Impact Report (1.2.0, 2026-10-28)
- Version change: 1.1.0 → 1.2.0 (MINOR: o cliente ganha um app mobile; o princípio mobile-first e o link público continuam, com novo papel)
- Modified principles: VIII. Mobile-first e simplicidade operacional — o link público deixa de ser o único
  canal do cliente e vira porta de entrada e alternativa ao app.
- Added sections: none (tabela de restrições técnicas ganha o app do cliente; Glossário ganha 2 termos)
- Removed sections: none
- Impact: spec 004 ajustada (cliente usa o app; link público é a porta de entrada). Futura feature de
  agendamento deve construir o app do cliente (ver ADR 0003). Specs 001-003 não são afetadas.
- Templates: not modified (dependent templates read the constitution at runtime)
- Follow-up TODOs: definir no plan da feature de agendamento onde o app do cliente fica no monorepo;
  confirmar com a barbearia piloto a conta e o identificador do app atual (ADR 0003).

Sync Impact Report (1.1.0, 2026-10-28)
- Version change: 1.0.0 → 1.1.0 (MINOR: nova regra no Princípio I e novos termos no glossário)
- Modified principles: I. Multi-tenancy obrigatório — adicionadas regras de leitura pública sem login
  e de arquivos públicos.
- Added sections: none (2 termos no Glossário: Tema, Identidade visual da barbearia)
- Removed sections: none
- Impact: spec 004 (leitura pública da identidade pelo link da barbearia, FR-029/FR-030) já está
  em conformidade; a feature de agendamento (link público) deve seguir a mesma regra.
  Specs 001-003 não são afetadas.
- Templates: not modified (dependent templates read the constitution at runtime)
- Follow-up TODOs: none

Sync Impact Report (1.0.0, 2026-10-17)
- Version change: (template, unversioned) → 1.0.0
- Modified principles: template placeholders replaced by 10 principles:
  I. Multi-tenancy obrigatório
  II. Integridade financeira (NON-NEGOTIABLE)
  III. Regras de negócio parametrizáveis e versionadas
  IV. Domínio puro e test-first (NON-NEGOTIABLE)
  V. Contratos primeiro
  VI. Monólito modular
  VII. Confiabilidade de integrações e jobs
  VIII. Mobile-first e simplicidade operacional
  IX. Privacidade e LGPD
  X. Simplicidade e entrega por fases
- Added sections: Restrições técnicas (SECTION_2), Fluxo de desenvolvimento (SECTION_3),
  Glossário (seção adicional), Governance
- Removed sections: none
- Templates: not modified (dependent templates read the constitution at runtime)
- Follow-up TODOs: none. Open technical decisions (gateway de pagamento, ORM/migrations,
  hospedagem/CI/CD/observabilidade) are tracked in "Restrições técnicas" as pending ADRs.
- Source: docs/constitution.md
-->

# SaaS Barbearia Constitution

Plataforma vertical de gestão para barbearias com o clube de assinatura no centro da operação: agenda, comanda, assinaturas recorrentes, rateio do clube por minutos, comissões e liquidação dos barbeiros.

Este documento define os princípios inegociáveis do projeto. Toda spec, plan, task e implementação deve estar em conformidade com ele. As regras de negócio detalhadas vivem no documento "Regras de Negócio — SaaS Barbearia (Fase 1)"; esta constitution define **como** o sistema é construído para que essas regras sejam aplicadas com segurança.

---

## Core Principles

### I. Multi-tenancy obrigatório

- Toda entidade de negócio pertence a uma barbearia (`tenant_id`) e, quando aplicável, a uma unidade (`unidade_id`).
- O isolamento entre barbearias é garantido no banco de dados por Row Level Security (RLS) no PostgreSQL, e não apenas na camada de aplicação.
- A hierarquia Barbearia → Unidades existe desde a primeira migration, mesmo que a barbearia piloto tenha uma única unidade.
- Toda assinatura nasce vinculada à unidade onde foi contratada.
- Nenhuma query, job ou relatório pode acessar dados sem o contexto de tenant definido. Testes automatizados devem cobrir o vazamento entre tenants.
- Leitura sem login (por exemplo, a página do link público da barbearia) só pode acontecer por uma **função ou view dedicada** que recebe o identificador público da barbearia e devolve **campos mínimos e explícitos**. É proibido abrir uma tabela para leitura anônima.
- Todo caminho de leitura pública tem testes que provam o que um visitante anônimo consegue e o que não consegue ler, incluindo o isolamento entre barbearias.
- Arquivos acessíveis sem login (como o logo da barbearia) ficam em armazenamento separado, que serve apenas esse conteúdo.

**Racional:** o produto é SaaS desde o primeiro cliente. Corrigir isolamento depois é caro e um vazamento de dados financeiros entre barbearias é inaceitável.

### II. Integridade financeira (NON-NEGOTIABLE)

- Todos os valores monetários são armazenados e calculados em **centavos inteiros**. É proibido usar ponto flutuante para dinheiro.
- Lançamentos financeiros formam um **ledger imutável (append-only)**. Nenhum lançamento é editado ou apagado; correções são feitas por lançamentos de estorno.
- Ao concluir uma comanda, o sistema grava um **snapshot** dos parâmetros vigentes: duração, preço, percentual de comissão, taxa do meio de pagamento e origem de cada item (plano ou avulso). Alterações posteriores em cadastros nunca afetam comandas concluídas.
- Um período fechado (mês liquidado) fica **travado**. Ajustes sobre ele geram lançamentos no período corrente.
- Rateios usam **arredondamento com distribuição de resíduo** (método do maior resto): a soma das partes é sempre igual ao total, ao centavo.
- Existe uma **única fonte da verdade**: todos os relatórios, dashboards e espelhos leem do mesmo ledger, com filtros de status explícitos e visíveis ao usuário.
- Casos de borda (mês sem minutos, barbeiro sem produção, unidade vazia) produzem zero, nunca erro ou divisão por zero.

**Racional:** a confiança do dono e dos barbeiros depende de os números baterem centavo a centavo com a planilha atual e entre todas as telas do sistema.

### III. Regras de negócio parametrizáveis e versionadas

- Nenhuma regra de remuneração ou de cobrança fica fixa no código. Toda regra vem de uma **Política de Remuneração** configurada por barbearia, com sobrescrita por barbeiro quando aplicável.
- A parametrização usa **opções fechadas**: cada regra é a escolha entre modos conhecidos, implementados como estratégias (strategy pattern). É proibido implementar fórmulas livres digitadas pelo usuário ou um motor de regras genérico.
- Toda política é **versionada por data de vigência**. O cálculo de um período sempre usa a versão vigente naquele período.
- Toda barbearia nova começa com um conjunto de padrões pronto (o da barbearia piloto) e altera apenas o que precisar.
- Adicionar um novo modo a uma regra exige spec própria, testes do novo modo e testes de regressão dos modos existentes.

**Racional:** o produto atende barbearias com regras diferentes, mas flexibilidade sem limite atrasa o MVP e torna o cálculo imprevisível.

### IV. Domínio puro e test-first (NON-NEGOTIABLE)

- As regras de cálculo (comissão de avulso, comissão de produto, tratamento de taxas e descontos, rateio do clube, piso de experiência, adiantamentos e espelho de pagamento) vivem em `packages/domain`, como **funções puras**.
- `packages/domain` não depende de framework, banco de dados, rede ou relógio do sistema. Recebe a política e os dados como parâmetros e devolve resultados determinísticos.
- O desenvolvimento do domínio segue **TDD estrito**: testes escritos e aprovados antes da implementação, ciclo Red → Green → Refactor.
- Os fechamentos reais da planilha da barbearia piloto são **golden tests** obrigatórios. Nenhuma mudança no domínio é aceita se um golden test falhar.
- Cada modo de cada regra parametrizável tem testes próprios, incluindo casos de borda e arredondamento.

**Racional:** o motor financeiro é o coração do produto e o ponto de maior risco. Mantê-lo puro torna o comportamento verificável e independente da infraestrutura.

### V. Contratos primeiro

- Toda comunicação entre frontends e API é definida por **contratos tipados em `packages/contracts`** (schemas Zod) antes da implementação.
- Os mesmos schemas validam entrada na API e tipam os clientes web e mobile. A documentação OpenAPI é gerada a partir deles.
- Mudanças incompatíveis em contratos exigem versionamento explícito do endpoint.
- Testes de contrato cobrem cada endpoint público.

**Racional:** API, admin web, link público e app do barbeiro evoluem juntos; contratos compartilhados eliminam divergência silenciosa entre eles.

### VI. Monólito modular

- O backend é um **monólito modular em NestJS**, organizado por bounded contexts: Identidade e Tenancy, Cadastros, Agenda e Comanda, Clube (planos e assinaturas), Financeiro (ledger, comissões, rateio e liquidação) e Caixa.
- Um módulo não acessa tabelas de outro módulo. A comunicação entre módulos acontece por interfaces públicas do módulo ou por eventos de domínio.
- Microserviços só podem ser introduzidos por ADR aprovado, com justificativa de escala ou isolamento comprovada.

**Racional:** fronteiras claras dão a maior parte dos benefícios de serviços separados sem o custo operacional de um sistema distribuído na fase atual.

### VII. Confiabilidade de integrações e jobs

- Todo webhook recebido (gateway de pagamento e futuras integrações) é **idempotente**: o mesmo evento processado duas vezes produz o mesmo resultado.
- Webhooks são persistidos ao chegar e processados de forma assíncrona por fila (BullMQ + Redis), com retentativa e registro de falhas.
- Jobs agendados (adiantamento do dia 20, fechamento do dia 05, conciliações) são idempotentes, rastreáveis e reexecutáveis com segurança.
- Efeitos colaterais que dependem de uma transação de banco usam o padrão outbox ou equivalente.
- Toda operação financeira registra quem a executou e quando (trilha de auditoria).

**Racional:** cobrança recorrente e liquidação envolvem dinheiro real; uma duplicidade ou perda de evento gera prejuízo e quebra de confiança.

### VIII. Mobile-first e simplicidade operacional

- Toda interface usada por cliente ou barbeiro é projetada primeiro para celular.
- O cliente usa um **app mobile na loja** (React Native com Expo), em duas modalidades com o mesmo código: app único do produto e app com marca própria da barbearia (ver ADR 0003). A barbearia é definida por configuração da build ou pelo link/QR, nunca por código.
- O link público da barbearia é leve, renderizado no servidor e funcional em conexões lentas; serve de porta de entrada (abre o app quando instalado) e de alternativa para quem ainda não o instalou.
- As telas são organizadas por tarefa (por exemplo: Hoje, Caixa, Equipe, Clientes), e não por listas extensas de relatórios.
- Toda funcionalidade nova deve responder qual tarefa do dia a dia da barbearia ela simplifica.

**Racional:** o dia a dia da barbearia acontece no balcão e na cadeira, com pressa e no celular. Complexidade de navegação é um dos principais problemas dos sistemas concorrentes.

### IX. Privacidade e LGPD

- Dados pessoais são coletados apenas quando necessários para a funcionalidade e com finalidade explícita.
- Dados de pagamento sensíveis (número de cartão) nunca são armazenados pela plataforma; ficam exclusivamente no gateway, por tokenização.
- Funcionalidades futuras que tratem imagem do rosto do cliente (visagismo) exigem consentimento explícito e específico, armazenamento segregado e política de retenção definida antes de qualquer implementação.
- Logs não contêm dados pessoais ou financeiros em texto claro.

**Racional:** a plataforma trata dados pessoais e financeiros de clientes finais de terceiros; conformidade é requisito de produto, não etapa posterior.

### X. Simplicidade e entrega por fases

- Cada feature implementa apenas o necessário para sua spec. Funcionalidades de fases futuras não são construídas antecipadamente.
- Exceção permitida: estruturas de dados de baixo custo que evitam migrações futuras previsíveis (por exemplo, `unidade_id` na assinatura e regras opcionais de limite de uso nos planos), desde que fiquem inativas por padrão.
- Toda complexidade adicional precisa de justificativa registrada no plan da feature.

**Racional:** o objetivo imediato é substituir o sistema atual da barbearia piloto com segurança; escopo extra atrasa essa entrega.

---

## Restrições técnicas

| Área | Decisão |
| --- | --- |
| Linguagem | TypeScript com `strict` habilitado em todo o monorepo |
| Repositório | Monorepo (Turborepo) com `apps/api`, `apps/admin`, `apps/booking`, `apps/barber`, `packages/domain`, `packages/contracts`, `packages/ui` |
| Backend | NestJS (monólito modular) |
| Banco de dados | PostgreSQL com Row Level Security |
| Filas e jobs | BullMQ + Redis |
| Admin web | Next.js |
| Link público da barbearia | Next.js com renderização no servidor, mobile-first; porta de entrada do app e alternativa web |
| App do barbeiro | React Native com Expo |
| App do cliente | React Native com Expo; mesmo código para o app único e para apps com marca própria (variantes por `APP_VARIANT`); localização no monorepo definida no plan da feature de agendamento |
| Datas e horários | Armazenados em UTC; cada unidade tem fuso horário configurado; cálculos de período mensal usam o fuso da unidade |
| Agenda | Conflito de horário impedido no banco (exclusion constraint com intervalos de tempo por barbeiro), com encaixe como exceção explícita |

Decisões ainda abertas, a registrar por ADR antes do plan das features que dependem delas:

- Gateway de pagamento para cobrança recorrente (necessário antes do plan da feature de assinaturas).
- ORM e ferramenta de migrations.
- Hospedagem, CI/CD e observabilidade.

---

## Fluxo de desenvolvimento

- Todo trabalho segue o ciclo do Spec Kit: `specify` → `clarify` → `plan` → `tasks` → `analyze` → `implement`.
- Cada feature tem branch própria no padrão `NNN-nome-da-feature`.
- Specs descrevem **o quê** e **por quê**, sem tecnologia. Decisões técnicas pertencem ao plan.
- Cada spec recebe apenas o recorte do documento de regras de negócio que a feature usa.
- Pontos não definidos são marcados como `[NEEDS CLARIFICATION]` e resolvidos antes do plan; nenhuma regra é inventada para preencher lacunas.
- Decisões arquiteturais relevantes são registradas como ADR em `docs/adr/`.
- Todo PR exige: testes passando (incluindo golden tests), lint e type-check sem erros, e verificação de conformidade com esta constitution.

---

## Glossário

- **Comanda:** registro de um atendimento, com seus itens, pagamentos e descontos.
- **Item de origem plano:** serviço coberto pela assinatura ativa do cliente; soma minutos ao rateio do clube.
- **Item de origem avulso:** serviço ou produto cobrado à parte; gera comissão sobre o valor cobrado.
- **Bolo do clube:** faturamento de assinaturas recebido no mês (regime de caixa), no escopo configurado (unidade ou rede).
- **Rateio:** divisão do bolo do clube entre barbeiros na proporção dos minutos de plano concluídos.
- **Política de Remuneração:** conjunto versionado de parâmetros que define como cada barbeiro é remunerado.
- **Espelho de pagamento:** demonstrativo mensal do barbeiro gerado no fechamento do dia 05.
- **Barbearia piloto:** primeira barbearia cliente, cujas regras definem os padrões iniciais do sistema.
- **Identidade visual da barbearia:** tema, nome de exibição, logo e as duas cores (principal e de destaque) que a barbearia escolhe e que aparecem para dono, barbeiros e clientes.
- **App único:** app do cliente publicado uma vez pelo produto, igual para todas as barbearias, que abre na barbearia certa por link ou QR.
- **App com marca própria:** app do cliente com o nome e o ícone da barbearia, publicado na conta de desenvolvedor dela, com o identificador da barbearia embutido na build.
- **Tema:** um entre três estilos visuais fechados definidos pelo produto (Noir, Dia e Couro). Muda só o visual, nunca a organização das telas.

---

## Governance

- Esta constitution prevalece sobre qualquer outra prática, convenção ou decisão de implementação.
- Alterações exigem: proposta documentada, justificativa, análise de impacto nas specs e no código existentes e plano de migração quando aplicável.
- O versionamento segue semântica: **MAJOR** para remoção ou redefinição incompatível de princípios; **MINOR** para novo princípio ou seção; **PATCH** para esclarecimentos e ajustes de redação.
- Todo plan deve conter uma verificação explícita de conformidade com esta constitution. Violações só são aceitas com justificativa registrada na seção de complexidade do plan.
- Revisões de código verificam a conformidade com os princípios marcados como NON-NEGOTIABLE.

**Version**: 1.2.0 | **Ratified**: 2026-10-17 | **Last Amended**: 2026-10-28
