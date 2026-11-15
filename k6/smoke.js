// Smoke test do endpoint principal (POST /orders) + leitura.
// Rodar: docker compose --profile k6 run --rm k6
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export const options = {
  // Smoke: carga baixa e constante, só para provar que funciona e medir p95.
  vus: 5,
  duration: '30s',
  thresholds: {
    // Mesmo alvo do SLO declarado em docs/desempenho.md
    'http_req_duration{endpoint:create}': ['p(95)<300'],
    'http_req_duration{endpoint:get}': ['p(95)<300'],
    http_req_failed: ['rate<0.01'],
    checks: ['rate>0.99'],
  },
};

export default function () {
  const payload = JSON.stringify({
    customerName: `Cliente k6 ${__VU}`,
    items: [
      { sku: 'CAFE-500G', name: 'Café 500g', quantity: 2, unitPriceCents: 2990 },
      { sku: 'FILTRO-103', name: 'Filtro 103', quantity: 1, unitPriceCents: 750 },
    ],
  });

  const created = http.post(`${BASE_URL}/orders`, payload, {
    headers: { 'Content-Type': 'application/json' },
    tags: { endpoint: 'create' },
  });
  check(created, {
    'POST /orders → 201': (r) => r.status === 201,
    'total correto': (r) => r.json('totalCents') === 6730,
  });

  const id = created.json('id');
  if (id) {
    const fetched = http.get(`${BASE_URL}/orders/${id}`, { tags: { endpoint: 'get' } });
    check(fetched, { 'GET /orders/:id → 200': (r) => r.status === 200 });
  }
  sleep(0.2);
}
