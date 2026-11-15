import type { Pool, PoolClient } from 'pg';
import { Order, type OrderItem, type OrderStatus } from '../../domain/order';
import type { ListOrdersQuery, OrderRepository } from '../../domain/order-repository';

interface OrderRow {
  id: string;
  customer_name: string;
  status: OrderStatus;
  created_at: Date;
  updated_at: Date;
  items: OrderItem[];
}

const SELECT_ORDER = `
  SELECT o.id, o.customer_name, o.status, o.created_at, o.updated_at,
         COALESCE(
           json_agg(json_build_object(
             'sku', i.sku, 'name', i.name, 'quantity', i.quantity, 'unitPriceCents', i.unit_price_cents
           ) ORDER BY i.position) FILTER (WHERE i.order_id IS NOT NULL),
           '[]'
         ) AS items
    FROM orders o
    LEFT JOIN order_items i ON i.order_id = o.id`;

function toDomain(row: OrderRow): Order {
  return Order.restore({
    id: row.id,
    customerName: row.customer_name,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items: row.items,
  });
}

/** Repository sobre `pg` com SQL explícito. Pedido + itens gravados na mesma transação. */
export class PostgresOrderRepository implements OrderRepository {
  constructor(private readonly pool: Pool) {}

  async save(order: Order): Promise<void> {
    const data = order.toJSON();
    await this.inTransaction(async (client) => {
      await client.query(
        `INSERT INTO orders (id, customer_name, status, total_cents, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [data.id, data.customerName, data.status, data.totalCents, data.createdAt, data.updatedAt],
      );
      for (const [position, item] of data.items.entries()) {
        await client.query(
          `INSERT INTO order_items (order_id, position, sku, name, quantity, unit_price_cents)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [data.id, position, item.sku, item.name, item.quantity, item.unitPriceCents],
        );
      }
    });
  }

  async findById(id: string): Promise<Order | null> {
    const { rows } = await this.pool.query<OrderRow>(`${SELECT_ORDER} WHERE o.id = $1 GROUP BY o.id`, [id]);
    return rows[0] ? toDomain(rows[0]) : null;
  }

  async list({ status, limit, offset }: ListOrdersQuery): Promise<{ data: Order[]; total: number }> {
    const where = status ? 'WHERE o.status = $3' : '';
    const params: unknown[] = [limit, offset];
    if (status) params.push(status);

    const [page, count] = await Promise.all([
      this.pool.query<OrderRow>(
        `${SELECT_ORDER} ${where} GROUP BY o.id ORDER BY o.created_at DESC LIMIT $1 OFFSET $2`,
        params,
      ),
      this.pool.query<{ total: string }>(
        `SELECT count(*) AS total FROM orders o ${status ? 'WHERE o.status = $1' : ''}`,
        status ? [status] : [],
      ),
    ]);
    return { data: page.rows.map(toDomain), total: Number(count.rows[0]?.total ?? 0) };
  }

  async updateStatus(order: Order): Promise<void> {
    const data = order.toJSON();
    await this.pool.query('UPDATE orders SET status = $2, updated_at = $3 WHERE id = $1', [
      data.id,
      data.status,
      data.updatedAt,
    ]);
  }

  private async inTransaction(work: (client: PoolClient) => Promise<void>): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await work(client);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
