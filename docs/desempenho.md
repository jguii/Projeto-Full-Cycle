# Desempenho e SLO

## SLO declarado

| Item | Definição |
|---|---|
| **SLI** | Fração das requisições `POST /orders` com status 2xx respondidas em **≤ 300 ms**, medida no servidor pelo histograma `http_request_duration_seconds` |
| **SLO** | **99 %** dessas requisições em ≤ 300 ms, janela móvel de 28 dias |
| **Orçamento de erro** | 1 % (≈ 1 em cada 100 pedidos pode passar de 300 ms) |
| **Disponibilidade (complementar)** | `http_request_duration_seconds_count{status_code=~"5.."}` / total < 0,5 % |

Consulta PromQL do SLI (o bucket `le="0.3"` existe de propósito no histograma):

```promql
sum(rate(http_request_duration_seconds_bucket{route="/orders",method="POST",status_code=~"2..",le="0.3"}[28d]))
/
sum(rate(http_request_duration_seconds_count{route="/orders",method="POST",status_code=~"2.."}[28d]))
```

Por que 300 ms: é um endpoint de escrita com uma transação curta (1 `INSERT` de pedido + N de itens).
O alvo é folgado em relação ao medido localmente (abaixo), deixando margem para rede/infra de nuvem.

## Medição — smoke test k6

- **Script:** [`k6/smoke.js`](../k6/smoke.js) — cada iteração cria um pedido (`POST /orders`, 2 itens) e o lê de volta (`GET /orders/:id`), com `sleep(0.2)`.
- **Carga:** 5 VUs constantes por 30 s (smoke: provar que funciona e medir, não estressar).
- **Thresholds (falham o teste):** p95 < 300 ms em cada endpoint, `http_req_failed` < 1 %, `checks` > 99 %.
- **Como reproduzir:** `docker compose up -d --build --wait api` e depois `docker compose --profile k6 run --rm k6`.
- **Ambiente da medição:** notebook Windows 11, Docker Desktop (WSL2), API e Postgres 17 em contêineres na mesma máquina, imagem de produção (`NODE_ENV=production`, `LOG_LEVEL=info`). Data: 15/11/2026.

### Resultado (execução local de 15/11/2026)

| Métrica | `POST /orders` | `GET /orders/:id` |
|---|---|---|
| Requisições | 725 | 725 |
| Mediana | 4,03 ms | 1,51 ms |
| p90 | 5,84 ms | 2,35 ms |
| **p95** | **6,89 ms** | **2,90 ms** |
| Máximo | 69,29 ms | 11,94 ms |
| Erros | 0 % | 0 % |

- Throughput: 48,2 req/s (limitado pelo `sleep` do script, não pela API).
- Uma execução anterior no mesmo dia deu p95 de 7,85 ms (`POST`) e 3,08 ms (`GET`): a variação entre execuções é de ~1 ms.
- Checks: 2175/2175 (100 %). Todos os thresholds passaram.

### Conferência pelo lado do servidor (`/metrics`, logo após o teste)

```
http_request_duration_seconds_bucket{le="0.01",method="POST",route="/orders",status_code="201"} 720
http_request_duration_seconds_bucket{le="0.3", method="POST",route="/orders",status_code="201"} 725
http_request_duration_seconds_count{method="POST",route="/orders",status_code="201"} 725
```

- SLI no período: 725/725 = **100 %** em ≤ 300 ms → SLO atendido.
- 720/725 = 99,3 % abaixo de 10 ms, coerente com o p95 de 6,89 ms visto pelo k6.

A CI repete esse smoke a cada push (job `smoke`) e publica o p95 no resumo do job.

## Leitura dos números

- O máximo de ~70 ms no `POST` aparece nas primeiras requisições (pool de conexões abrindo, JIT aquecendo); não se repete no p95.
- O `POST` custa ~2,5× o `GET` porque faz transação com 1 + N `INSERT`s em ida e volta separadas.

## O que eu faria diferente / próximos passos

1. **Inserir os itens num único `INSERT ... SELECT unnest(...)`** em vez de um por item: reduz idas ao banco de 2+N para 2. Deve baixar o p95 do `POST`, principalmente em pedidos com muitos itens — medir antes e depois com o mesmo script.
2. **Teste de carga além do smoke** (rampa até saturar) para achar o gargalo real — provavelmente o `max: 10` do pool de conexões.
3. **Idempotency-Key no `POST /orders`** para que retentativas do cliente não dupliquem pedidos.
