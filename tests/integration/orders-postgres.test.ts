import type { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { OrderService } from '../../src/application/order-service';
import { createApp } from '../../src/http/app';
import { migrate } from '../../src/infra/db/migrate';
import { createPool } from '../../src/infra/db/pool';
import { PostgresOrderRepository } from '../../src/infra/repositories/postgres-order-repository';
import { createMetrics } from '../../src/observability/metrics';

/**
 * Teste de integração: HTTP (Supertest) → serviço → repositório → Postgres REAL.
 * Requer DATABASE_URL apontando para um banco descartável
 * (local: `docker compose up -d db`; na CI: service container do GitHub Actions).
 */
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL é obrigatório para os testes de integração (veja o README).');
}

describe('Fluxo de pedidos contra Postgres real', () => {
  let pool: Pool;
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    pool = createPool(DATABASE_URL);
    await migrate(pool);
    const metrics = createMetrics();
    app = createApp({
      orderService: new OrderService(new PostgresOrderRepository(pool), metrics.orderEvents),
      metrics,
      checkReadiness: async () => {
        await pool.query('SELECT 1');
      },
    });
  });

  beforeEach(async () => {
    await pool.query('TRUNCATE orders CASCADE');
  });

  afterAll(async () => {
    await pool.end();
  });

  it('migração é idempotente', async () => {
    expect(await migrate(pool)).toEqual([]);
  });

  it('cria, lê, lista e avança status persistindo no banco', async () => {
    const payload = {
      customerName: 'João',
      items: [
        { sku: 'B', name: 'Segundo', quantity: 1, unitPriceCents: 500 },
        { sku: 'A', name: 'Primeiro', quantity: 3, unitPriceCents: 1000 },
      ],
    };
    const { body: created } = await request(app).post('/orders').send(payload).expect(201);

    const { rows } = await pool.query('SELECT status, total_cents FROM orders WHERE id = $1', [created.id]);
    expect(rows[0]).toEqual({ status: 'PENDING', total_cents: '3500' });

    const { body: fetched } = await request(app).get(`/orders/${created.id}`).expect(200);
    expect(fetched.items.map((i: { sku: string }) => i.sku)).toEqual(['B', 'A']); // ordem preservada
    expect(fetched.totalCents).toBe(3500);

    await request(app).patch(`/orders/${created.id}/status`).send({ status: 'PAID' }).expect(200);
    await request(app).patch(`/orders/${created.id}/status`).send({ status: 'DELIVERED' }).expect(409);

    const { body: page } = await request(app).get('/orders').query({ status: 'PAID' }).expect(200);
    expect(page.total).toBe(1);
    expect(page.data[0]).toMatchObject({ id: created.id, status: 'PAID' });

    const { body: empty } = await request(app).get('/orders').query({ status: 'PENDING' }).expect(200);
    expect(empty).toMatchObject({ total: 0, data: [] });
  });

  it('readiness responde ok com banco disponível', async () => {
    await request(app).get('/health/ready').expect(200, { status: 'ok' });
  });

  it('desfaz a transação se um item violar restrição do banco', async () => {
    const repo = new PostgresOrderRepository(pool);
    const service = new OrderService(repo);
    const order = await service.create({
      customerName: 'Ana',
      items: [{ sku: 'X', name: 'X', quantity: 1, unitPriceCents: 1 }],
    });
    // Salvar o mesmo pedido de novo viola a PK → nada parcial pode sobrar.
    await expect(repo.save(order)).rejects.toThrow();
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM order_items WHERE order_id = $1', [order.id]);
    expect(rows[0].n).toBe(1);
  });
});
