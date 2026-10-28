# ADR 0003: App do cliente na loja, com marca própria para a barbearia piloto e app único depois

- **Status**: Aceito
- **Data**: 2026-10-28
- **Feature**: [004-barbershop-branding](../../specs/004-barbershop-branding/spec.md) (identidade lida do servidor) e a futura feature de agendamento

## Contexto

A constitution 1.1.0 previa o cliente usando apenas o link público de agendamento (web). A barbearia piloto, porém, tem hoje um app na loja com o nome dela, usado por clientes e por barbeiros, e o dono acessa a gestão por um link. Trocar o app do cliente por um link seria perder algo que a barbearia considera parte do valor ("premium") e que os clientes já usam.

O produto também quer, mais adiante, atender outras barbearias em duas modalidades:

- **Modalidade 1 (app único)**: um app do produto na loja, igual para todas as barbearias, que abre na barbearia certa por link ou QR, com o visual dela (feature 004).
- **Modalidade 2 (app com marca própria)**: um app com o nome e o ícone da barbearia, publicado na conta de desenvolvedor dela, com custo extra.

## Decisão

1. O cliente passa a ter um **app mobile na loja** (React Native com Expo), mesmo código para as duas modalidades.
2. A barbearia é definida por **configuração, nunca por código**:
   - no app com marca própria, o identificador da barbearia vem embutido na build (variante do Expo, por `APP_VARIANT` em `app.config.js` e um perfil de build por barbearia);
   - no app único, o identificador vem do link ou do QR da barbearia.
     Nome, logo, cores e tema vêm sempre do servidor, pela identidade da feature 004.
3. A **primeira variante** é a da barbearia piloto, com o nome **Barbershop Tribo's**. O app único (modalidade 1) é construído depois, como a mesma base sem a barbearia embutida.
4. O **link público** da barbearia continua existindo como porta de entrada e alternativa: abre o app quando instalado e, caso contrário, mostra a página com a identidade da barbearia (leitura pública da 004) e leva à loja.
5. A barbearia piloto **não perde o que tem hoje**: o novo app deve ser publicado como atualização do app atual, mantendo o mesmo identificador e a mesma conta de publicação, sempre que for possível.

## Consequências

- **Positivas**: a piloto mantém o app com o nome dela; o app único depois reaproveita o mesmo código; a 004 serve às duas modalidades sem retrabalho.
- **Negativas**: há um app de cliente a construir e a manter (o plano anterior não previa); cada barbearia com marca própria exige conta de desenvolvedor, assets e uma build própria; mudanças nativas exigem nova revisão da loja em cada app.
- **Riscos**: publicar como atualização do app atual depende de ter acesso à conta da loja e às chaves de assinatura dele; se o app atual foi feito por terceiros, isso pode não ser possível sem a colaboração deles. A migração dos clientes e barbeiros atuais precisa de aviso.

## Regras para a implementação

- Nenhum nome, cor, logo ou identificador de barbearia fixo no código do app; tudo vem da configuração da variante ou do servidor.
- O app com marca própria e o app único compartilham o mesmo código; a diferença é só a configuração da build.
- A leitura da identidade antes do login segue a regra da constitution (função dedicada, campos mínimos).

## Alternativas consideradas

- **Só link e PWA para o cliente**: mais simples e barato, mas faz a piloto perder o app que tem hoje.
- **Base de código separada por barbearia**: não escala e duplica correções.
- **Só app único**: não atende a piloto, que quer o nome dela na loja.

## Pendente

- Confirmar com a barbearia piloto: a conta da loja que publica o app atual, o identificador (bundle ID e package) e quem tem as chaves de assinatura.
- Definir o identificador do app Barbershop Tribo's (reaproveitando o atual, se possível).
- Definir, no plan da feature de agendamento, onde o app do cliente fica no monorepo.
