import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { OrderService } from '../../src/application/order-service';
import { createApp } from '../../src/http/app';
import { InMemoryOrderRepository } from '../../src/infra/repositories/in-memory-order-repository';
import { createMetrics } from '../../src/observability/metrics';

const body = {
  customerName: 'Maria',
  items: [
    { sku: 'CAFE', name: 'Café', quantity: 2, unitPriceCents: 2990 },
    { sku: 'FILTRO', name: 'Filtro', quantity: 1, unitPriceCents: 750 },
  ],
};

function buildApp(ready = true) {
  const metrics = createMetrics();
  const service = new OrderService(new InMemoryOrderRepository(), metrics.orderEvents);
  const app = createApp({
    orderService: service,
    metrics,
    checkReadiness: async () => {
      if (!ready) throw new Error('db down');
    },
  });
  return { app, metrics };
}

describe('HTTP /orders (camada HTTP com repositório em memória)', () => {
  let app: ReturnType<typeof buildApp>['app'];

  beforeEach(() => {
    app = buildApp().app;
  });

  it('POST /orders cria pedido e retorna 201 + Location', async () => {
    const res = await request(app).post('/orders').send(body).expect(201);
    expect(res.headers.location).toBe(`/orders/${res.body.id}`);
    expect(res.body).toMatchObject({ status: 'PENDING', totalCents: 6730, customerName: 'Maria' });
  });

  it('fluxo completo: cria → consulta → paga → envia → entrega', async () => {
    const { body: created } = await request(app).post('/orders').send(body).expect(201);
    await request(app).get(`/orders/${created.id}`).expect(200);
    for (const status of ['PAID', 'SHIPPED', 'DELIVERED']) {
      const res = await request(app).patch(`/orders/${created.id}/status`).send({ status }).expect(200);
      expect(res.body.status).toBe(status);
    }
  });

  it('400 com detalhes quando o corpo é inválido', async () => {
    const res = await request(app).post('/orders').send({ customerName: '', items: [] }).expect(400);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body.errors.map((e: { path: string }) => e.path)).toEqual(['customerName', 'items']);
  });

  it('400 para JSON malformado', async () => {
    await request(app).post('/orders').set('content-type', 'application/json').send('{"x":').expect(400);
  });

  it('422 para regra de negócio violada (SKU duplicado)', async () => {
    const dup = { ...body, items: [body.items[0], body.items[0]] };
    const res = await request(app).post('/orders').send(dup).expect(422);
    expect(res.body.code).toBe('DUPLICATED_ITEM');
  });

  it('409 para transição inválida', async () => {
    const { body: created } = await request(app).post('/orders').send(body);
    const res = await request(app).patch(`/orders/${created.id}/status`).send({ status: 'DELIVERED' }).expect(409);
    expect(res.body.code).toBe('INVALID_TRANSITION');
  });

  it('404 para pedido inexistente e 400 para id que não é UUID', async () => {
    await request(app).get('/orders/00000000-0000-4000-8000-000000000000').expect(404);
    await request(app).get('/orders/abc').expect(400);
  });

  it('GET /orders lista com filtro e paginação', async () => {
    await request(app).post('/orders').send(body);
    const { body: second } = await request(app).post('/orders').send(body);
    await request(app).patch(`/orders/${second.id}/status`).send({ status: 'PAID' });

    const res = await request(app).get('/orders').query({ status: 'PAID', limit: 5 }).expect(200);
    expect(res.body).toMatchObject({ total: 1, limit: 5, offset: 0 });
    expect(res.body.data[0].id).toBe(second.id);
  });

  it('404 em formato problem+json para rota inexistente', async () => {
    const res = await request(app).get('/nada').expect(404);
    expect(res.body.title).toBe('Não encontrado');
  });
});

describe('Operação: health, métricas e docs', () => {
  it('liveness sempre ok; readiness reflete o banco', async () => {
    await request(buildApp().app).get('/health/live').expect(200, { status: 'ok' });
    await request(buildApp(true).app).get('/health/ready').expect(200);
    await request(buildApp(false).app).get('/health/ready').expect(503, { status: 'unavailable' });
  });

  it('/metrics expõe histograma de latência por rota e contador de pedidos', async () => {
    const { app } = buildApp();
    const { body: created } = await request(app).post('/orders').send(body);
    await request(app).patch(`/orders/${created.id}/status`).send({ status: 'PAID' });

    const res = await request(app).get('/metrics').expect(200);
    expect(res.text).toContain('http_request_duration_seconds_bucket{le="0.3",method="POST",route="/orders",status_code="201"}');
    expect(res.text).toContain('route="/orders/:id/status"');
    expect(res.text).toMatch(/^orders_created_total 1$/m);
    expect(res.text).toContain('order_status_transitions_total{from="PENDING",to="PAID"} 1');
  });

  it('serve a especificação OpenAPI', async () => {
    const res = await request(buildApp().app).get('/openapi.json').expect(200);
    expect(res.body.openapi).toBe('3.1.0');
    expect(Object.keys(res.body.paths)).toContain('/orders');
  });
});
