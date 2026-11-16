**Nível: Projeto B (simples)** · Individual · João Guilherme Pimentel

# API de Pedidos

[![CI](https://github.com/jguii/Projeto-Full-Cycle/actions/workflows/ci.yml/badge.svg)](https://github.com/jguii/Projeto-Full-Cycle/actions/workflows/ci.yml)

API de domínio único para **pedidos**: criar um pedido com itens, consultá-lo e avançar o status
até a entrega. Projeto final do curso Full Cycle — Módulo 4.

```
POST /orders ──► PENDING ──► PAID ──► SHIPPED ──► DELIVERED
                    │          │
                    └──────────┴──► CANCELED
```

Valores monetários são inteiros em **centavos**. Transições fora do diagrama retornam `409`.

---

## Subir em 1 comando

Pré-requisitos: **Git** e **Docker** (com Compose v2). Node só é necessário para rodar os testes fora do Docker.

```bash
git clone https://github.com/jguii/Projeto-Full-Cycle.git
```

```bash
cd Projeto-Full-Cycle
```

```bash
cp .env.example .env
```

```bash
docker compose up --build
```

Pronto: API em <http://localhost:3000>, documentação interativa em <http://localhost:3000/docs>.
As migrações rodam sozinhas na subida do contêiner.

> O Postgres do Compose é exposto na porta **5433** do host (não 5432) para não colidir com um Postgres instalado localmente.

Comandos do dia a dia:

| Comando | O que faz |
|---|---|
| `docker compose up -d --build` | Sobe em segundo plano, reconstruindo a imagem da API |
| `docker compose ps` | Mostra os contêineres e se estão saudáveis |
| `docker compose logs -f api` | Acompanha os logs da API (JSON estruturado) |
| `docker compose down` | Desliga tudo, **mantendo** os dados do banco |
| `docker compose down -v` | Desliga tudo e **apaga** os dados do banco |

### Testar na mão

O jeito mais fácil é pelo navegador: abra <http://localhost:3000/docs>, escolha `POST /orders` → *Try it out* → *Execute*.

Pelo terminal (Linux, macOS ou Git Bash; no PowerShell use `curl.exe` em vez de `curl`):

```bash
curl -s -X POST localhost:3000/orders -H "content-type: application/json" -d '{"customerName":"Maria","items":[{"sku":"CAFE-500G","name":"Cafe 500g","quantity":2,"unitPriceCents":2990}]}'
```

```bash
curl -s -X PATCH localhost:3000/orders/<id>/status -H "content-type: application/json" -d '{"status":"PAID"}'
```

| Método | Rota | O que faz |
|---|---|---|
| `POST` | `/orders` | **Endpoint principal**: cria pedido (`201` + `Location`) |
| `GET` | `/orders/:id` | Consulta um pedido |
| `GET` | `/orders?status=&limit=&offset=` | Lista paginada |
| `PATCH` | `/orders/:id/status` | Avança o status |
| `GET` | `/health/live` · `/health/ready` | Liveness / readiness (banco) |
| `GET` | `/metrics` | Métricas Prometheus |
| `GET` | `/docs` · `/openapi.json` | Swagger UI / especificação |

Contrato completo: [`docs/openapi.yaml`](docs/openapi.yaml) (OpenAPI 3.1, validado pelo Spectral na CI).

---

## Como testar

Requer Node 22+ (a CI usa 24).

```bash
npm ci
```

```bash
npm run test:unit
```

Testes unitários do domínio, do serviço e da camada HTTP (Supertest com repositório em memória). **Não precisa de banco.**
Gera relatório em `coverage/`.

```bash
docker compose up -d --wait db
```

```bash
npm run test:integration
```

Teste de integração **HTTP → serviço → Postgres real**, lendo `DATABASE_URL` do `.env`.
Ele faz `TRUNCATE` nas tabelas: use um banco descartável (o do Compose serve).

```bash
docker compose --profile k6 run --rm k6
```

Smoke test k6 com p95 medido (a API precisa estar de pé; o k6 fica num *profile* e só roda com esse comando).
Último resultado: **p95 de 6,89 ms no `POST /orders`**, 0 % de erro. Detalhes em [`docs/desempenho.md`](docs/desempenho.md).

Outros: `npm run lint`, `npm run typecheck`, `npm run lint:openapi`, `npm run dev` (hot reload, banco do Compose).

### Coverage mínimo declarado

Definido em [`vitest.config.mts`](vitest.config.mts) e aplicado pela CI — se cair, o build falha:

| Linhas | Statements | Funções | Branches |
|---|---|---|---|
| 80 % | 80 % | 80 % | 75 % |

Medido hoje: ≈ 99 % de linhas, ≈ 92 % de branches.

---

## CI

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) roda em todo push/PR, com 4 jobs:

| Job | O que garante |
|---|---|
| `quality` | `npm ci` → ESLint → typecheck → Spectral (OpenAPI) → testes unitários com coverage mínimo → `npm audit` (SCA) |
| `integration` | Teste de integração contra Postgres 17 (service container) |
| `secrets` | gitleaks em todo o histórico — falha se houver segredo commitado |
| `smoke` | `docker compose up --wait` + k6 smoke com thresholds de p95; p95 publicado no resumo do job |

**Execução verde:** <https://github.com/jguii/Projeto-Full-Cycle/actions/runs/43755917191> (4/4 jobs com sucesso)

---

## Configuração, ambientes e segredos

- Toda configuração vem de **variáveis de ambiente**, validadas na subida por [`src/config/env.ts`](src/config/env.ts) (zod). Faltou algo → o processo não sobe e diz o quê.
- [`.env.example`](.env.example) documenta todas as variáveis; o `.env` real está no `.gitignore`.
- Ambientes por `NODE_ENV` (`development`, `test`, `production`). A imagem Docker sobe em `production`.
- Na CI, a única credencial é a de um Postgres efêmero criado e destruído no próprio job. Para deploy, a `DATABASE_URL` real iria em **GitHub Environments/Secrets**, nunca no código.
- O gitleaks roda na CI sobre todo o histórico do git.

## Observabilidade

- **Logs estruturados** (pino, JSON uma linha por evento) com `service`, `env`, request id, status e tempo de resposta; `authorization`, `cookie` e senhas são mascarados.
- **Métricas** (prom-client) em `/metrics`:
  - `http_request_duration_seconds` — histograma por `method`, `route` e `status_code` (a métrica do SLO);
  - `orders_created_total` e `order_status_transitions_total{from,to}` — métricas de negócio.
- **SLO:** 99 % dos `POST /orders` bem-sucedidos em ≤ 300 ms (janela de 28 dias). Definição, PromQL e medição em [`docs/desempenho.md`](docs/desempenho.md).

## Arquitetura e design

```
src/
├─ domain/          Order (entidade + máquina de estados), erros, porta OrderRepository
├─ application/     OrderService (casos de uso)
├─ infra/           PostgresOrderRepository, InMemoryOrderRepository, pool, migrações
├─ http/            app Express, router, validação (zod), tradução de erros (RFC 9457)
├─ observability/   logger (pino) e métricas (prom-client)
├─ config/          leitura e validação do ambiente
└─ server.ts        composition root: único lugar que conhece as classes concretas
```

- **Pattern justificado:** *Repository* — o domínio depende da interface, não do Postgres. Decisão e alternativa descartada (Prisma) em [`docs/adr/0001-repository-com-sql-puro.md`](docs/adr/0001-repository-com-sql-puro.md).
- **SOLID:** SRP (entidade só regra, serviço só orquestra, router só HTTP); DIP (serviço recebe `OrderRepository` e `OrderEvents` por construtor); OCP (métricas plugadas via `OrderEvents` sem o serviço conhecer o Prometheus).
- **Contêiner:** build multi-stage, imagem final só com dependências de produção, usuário sem root, `HEALTHCHECK`, desligamento gracioso em `SIGTERM`.

## Documentação

| Arquivo | Conteúdo |
|---|---|
| [`docs/openapi.yaml`](docs/openapi.yaml) | Contrato OpenAPI 3.1 |
| [`docs/adr/0001-repository-com-sql-puro.md`](docs/adr/0001-repository-com-sql-puro.md) | ADR (formato MADR) |
| [`docs/desempenho.md`](docs/desempenho.md) | SLO, smoke k6 e p95 medido |
| [`docs/ia.md`](docs/ia.md) | Uso de IA e prompts relevantes |
| [`CONTRIBUTORS.md`](CONTRIBUTORS.md) | Quem fez o quê |
