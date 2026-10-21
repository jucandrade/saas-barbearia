# Contrato: `GET /health` (apps/api)

Endpoint **operacional**, consumido por desenvolvedores, CI e futuro monitoramento. Não é consumido pelos frontends, por isso não fica em `packages/contracts` (ver Constitution Check no [plan](../plan.md)).

## Requisição

```
GET /health
```

Sem parâmetros, corpo ou autenticação.

## Resposta de sucesso

- **Status**: `200 OK`
- **Content-Type**: `application/json`
- **Corpo**:

```json
{ "status": "ok" }
```

## Regras

- Não consulta banco, fila nem serviço externo nesta feature: responde sucesso sempre que o processo está de pé.
- Não expõe versão, ambiente, hostname nem qualquer dado interno (princípio IX).
- Coberto por um teste automatizado em `apps/api/test/health.spec.ts` (Vitest + supertest).
