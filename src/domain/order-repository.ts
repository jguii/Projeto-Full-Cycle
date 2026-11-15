import type { Order, OrderStatus } from './order';

export interface ListOrdersQuery {
  status?: OrderStatus;
  limit: number;
  offset: number;
}

/**
 * Porta de persistência (Repository pattern — ver docs/adr/0001-repository-com-sql-puro.md).
 * O domínio e o serviço dependem desta abstração, nunca do driver do Postgres (DIP).
 */
export interface OrderRepository {
  save(order: Order): Promise<void>;
  findById(id: string): Promise<Order | null>;
  list(query: ListOrdersQuery): Promise<{ data: Order[]; total: number }>;
  updateStatus(order: Order): Promise<void>;
}
