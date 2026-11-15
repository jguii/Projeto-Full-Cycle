import { randomUUID } from 'node:crypto';
import { DomainError } from './errors';

export const ORDER_STATUSES = ['PENDING', 'PAID', 'SHIPPED', 'DELIVERED', 'CANCELED'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Máquina de estados do pedido: único lugar que decide quais transições são válidas. */
const ALLOWED_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  PENDING: ['PAID', 'CANCELED'],
  PAID: ['SHIPPED', 'CANCELED'],
  SHIPPED: ['DELIVERED'],
  DELIVERED: [],
  CANCELED: [],
};

export interface OrderItem {
  sku: string;
  name: string;
  quantity: number;
  /** Preço unitário em centavos (inteiro) para evitar erro de ponto flutuante. */
  unitPriceCents: number;
}

export interface OrderProps {
  id: string;
  customerName: string;
  items: OrderItem[];
  status: OrderStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateOrderInput {
  customerName: string;
  items: OrderItem[];
}

export const MAX_ITEMS_PER_ORDER = 50;

/**
 * Entidade de domínio. Não conhece HTTP nem banco (SRP / DIP):
 * só garante invariantes e regras de transição.
 */
export class Order {
  private constructor(private props: OrderProps) {}

  static create(input: CreateOrderInput, now: Date = new Date()): Order {
    const customerName = input.customerName.trim();
    if (customerName.length === 0) {
      throw new DomainError('INVALID_CUSTOMER', 'O nome do cliente é obrigatório.');
    }
    if (input.items.length === 0) {
      throw new DomainError('EMPTY_ORDER', 'O pedido precisa de pelo menos um item.');
    }
    if (input.items.length > MAX_ITEMS_PER_ORDER) {
      throw new DomainError('TOO_MANY_ITEMS', `O pedido aceita no máximo ${MAX_ITEMS_PER_ORDER} itens.`);
    }
    const skus = new Set<string>();
    for (const item of input.items) {
      Order.assertValidItem(item);
      if (skus.has(item.sku)) {
        throw new DomainError('DUPLICATED_ITEM', `O SKU ${item.sku} aparece mais de uma vez; some as quantidades.`);
      }
      skus.add(item.sku);
    }

    return new Order({
      id: randomUUID(),
      customerName,
      items: input.items.map((i) => ({ ...i })),
      status: 'PENDING',
      createdAt: now,
      updatedAt: now,
    });
  }

  /** Reconstrói a partir da persistência, sem reaplicar regras de criação. */
  static restore(props: OrderProps): Order {
    return new Order({ ...props, items: props.items.map((i) => ({ ...i })) });
  }

  private static assertValidItem(item: OrderItem): void {
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      throw new DomainError('INVALID_QUANTITY', `Quantidade inválida para o SKU ${item.sku}.`);
    }
    if (!Number.isInteger(item.unitPriceCents) || item.unitPriceCents < 0) {
      throw new DomainError('INVALID_PRICE', `Preço inválido para o SKU ${item.sku}.`);
    }
  }

  get id(): string {
    return this.props.id;
  }
  get status(): OrderStatus {
    return this.props.status;
  }
  get items(): readonly OrderItem[] {
    return this.props.items;
  }

  get totalCents(): number {
    return this.props.items.reduce((sum, i) => sum + i.quantity * i.unitPriceCents, 0);
  }

  canTransitionTo(next: OrderStatus): boolean {
    return ALLOWED_TRANSITIONS[this.props.status].includes(next);
  }

  changeStatus(next: OrderStatus, now: Date = new Date()): void {
    if (!this.canTransitionTo(next)) {
      throw new DomainError(
        'INVALID_TRANSITION',
        `Não é possível mudar o pedido de ${this.props.status} para ${next}.`,
      );
    }
    this.props.status = next;
    this.props.updatedAt = now;
  }

  toJSON(): OrderProps & { totalCents: number } {
    return { ...this.props, items: this.props.items.map((i) => ({ ...i })), totalCents: this.totalCents };
  }
}
