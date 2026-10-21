# ADR 0001: GitHub Actions como plataforma de integração contínua

- **Status**: Aceito
- **Data**: 2026-10-17
- **Feature**: [001-repo-foundation](../../specs/001-repo-foundation/plan.md)

## Contexto

A constitution deixa em aberto "Hospedagem, CI/CD e observabilidade" e exige um ADR antes do plan das features que dependem dessas decisões. A feature 001 precisa de uma pipeline que, a cada push:

- rode formatação, lint, tipos e testes em **Linux** e em **Windows**, porque o desenvolvimento é feito em Windows e o ambiente alvo é Linux;
- gere o build dos apps e suba Postgres e Redis via Docker Compose no Linux.

O repositório remoto está no GitHub (`jucandrade/saas-barbearia`).

## Decisão

Usar **GitHub Actions** como plataforma de integração contínua, com um workflow (`.github/workflows/ci.yml`) e dois jobs independentes:

- `linux` em `ubuntu-latest`, com todas as etapas, incluindo build e subida/verificação da infraestrutura com o mesmo comando usado localmente;
- `windows` em `windows-latest` (PowerShell), com instalação, formatação, lint, tipos e testes, sem contêineres.

Os detalhes estão em [specs/001-repo-foundation/contracts/ci.md](../../specs/001-repo-foundation/contracts/ci.md).

## Consequências

- **Positivas**: integração nativa com o repositório, PRs e status checks, sem serviço adicional; runners Linux e Windows hospedados; Docker e Docker Compose disponíveis no runner Linux; actions oficiais para pnpm e Node com cache.
- **Negativas**: a pipeline fica acoplada ao GitHub. Os runners Windows não executam contêineres Linux, por isso a infraestrutura só é verificada no Linux. Os runners Windows são mais lentos e consomem mais minutos.
- **Mitigação**: toda a lógica fica em comandos `pnpm` do repositório; o YAML só os chama, o que torna a migração de plataforma barata.

## Alternativas consideradas

- **GitLab CI, CircleCI, Azure Pipelines**: exigiriam integrar outro serviço ao repositório no GitHub, sem ganho para o caso de uso.
- **Só Linux**: rejeitada na clarificação da spec, porque não protege o requisito de paridade com o Windows.

## Fora deste ADR

Hospedagem, CD (deploy) e observabilidade continuam como decisões abertas da constitution.
