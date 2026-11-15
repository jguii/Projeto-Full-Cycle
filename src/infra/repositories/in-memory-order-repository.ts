import { Order } from '../../domain/order';
import type { ListOrdersQuery, OrderRepository } from '../../domain/order-repository';

/** Implementação em memória: usada nos testes unitários e como prova de que o serviço não depende do Postgres. */
export class InMemoryOrderRepository implements OrderRepository {
  private readonly store = new Map<string, ReturnType<Order['toJSON']>>();

  async save(order: Order): Promise<void> {
    this.store.set(order.id, order.toJSON());
  }

  async findById(id: string): Promise<Order | null> {
    const props = this.store.get(id);
    return props ? Order.restore(props) : null;
  }

  async list({ status, limit, offset }: ListOrdersQuery): Promise<{ data: Order[]; total: number }> {
    const all = [...this.store.values()]
      .filter((o) => !status || o.status === status)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return { data: all.slice(offset, offset + limit).map((p) => Order.restore(p)), total: all.length };
  }

  async updateStatus(order: Order): Promise<void> {
    if (!this.store.has(order.id)) throw new Error(`Pedido ${order.id} não existe.`);
    this.store.set(order.id, order.toJSON());
  }
}
