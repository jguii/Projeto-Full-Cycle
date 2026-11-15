import { NotFoundError } from '../domain/errors';
import { Order, type CreateOrderInput, type OrderStatus } from '../domain/order';
import type { ListOrdersQuery, OrderRepository } from '../domain/order-repository';

export interface OrderEvents {
  orderCreated(order: Order): void;
  orderStatusChanged(order: Order, from: OrderStatus): void;
}

const noopEvents: OrderEvents = { orderCreated: () => {}, orderStatusChanged: () => {} };

/** Casos de uso do fluxo principal: criar → consultar → avançar status. */
export class OrderService {
  constructor(
    private readonly repository: OrderRepository,
    private readonly events: OrderEvents = noopEvents,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async create(input: CreateOrderInput): Promise<Order> {
    const order = Order.create(input, this.clock());
    await this.repository.save(order);
    this.events.orderCreated(order);
    return order;
  }

  async getById(id: string): Promise<Order> {
    const order = await this.repository.findById(id);
    if (!order) throw new NotFoundError(`Pedido ${id} não encontrado.`);
    return order;
  }

  list(query: ListOrdersQuery): Promise<{ data: Order[]; total: number }> {
    return this.repository.list(query);
  }

  async changeStatus(id: string, next: OrderStatus): Promise<Order> {
    const order = await this.getById(id);
    const previous = order.status;
    order.changeStatus(next, this.clock());
    await this.repository.updateStatus(order);
    this.events.orderStatusChanged(order, previous);
    return order;
  }
}
