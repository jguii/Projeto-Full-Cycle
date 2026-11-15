import { describe, expect, it } from 'vitest';
import { DomainError } from '../../src/domain/errors';
import { MAX_ITEMS_PER_ORDER, Order, type OrderItem } from '../../src/domain/order';

const item = (overrides: Partial<OrderItem> = {}): OrderItem => ({
  sku: 'CAFE-500G',
  name: 'Café 500g',
  quantity: 2,
  unitPriceCents: 2990,
  ...overrides,
});

describe('Order.create', () => {
  it('cria pedido PENDING com total em centavos', () => {
    const now = new Date('2026-11-01T10:00:00Z');
    const order = Order.create(
      { customerName: '  Maria  ', items: [item(), item({ sku: 'FILTRO', quantity: 1, unitPriceCents: 750 })] },
      now,
    );

    expect(order.status).toBe('PENDING');
    expect(order.totalCents).toBe(2 * 2990 + 750);
    expect(order.toJSON()).toMatchObject({ customerName: 'Maria', createdAt: now, updatedAt: now });
    expect(order.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it.each([
    ['cliente vazio', { customerName: '   ', items: [item()] }, 'INVALID_CUSTOMER'],
    ['sem itens', { customerName: 'Ana', items: [] }, 'EMPTY_ORDER'],
    ['quantidade zero', { customerName: 'Ana', items: [item({ quantity: 0 })] }, 'INVALID_QUANTITY'],
    ['quantidade fracionada', { customerName: 'Ana', items: [item({ quantity: 1.5 })] }, 'INVALID_QUANTITY'],
    ['preço negativo', { customerName: 'Ana', items: [item({ unitPriceCents: -1 })] }, 'INVALID_PRICE'],
    ['SKU repetido', { customerName: 'Ana', items: [item(), item()] }, 'DUPLICATED_ITEM'],
  ])('rejeita %s', (_label, input, code) => {
    expect(() => Order.create(input)).toThrowError(expect.objectContaining({ name: 'DomainError', code }));
  });

  it('rejeita pedido acima do limite de itens', () => {
    const items = Array.from({ length: MAX_ITEMS_PER_ORDER + 1 }, (_, i) => item({ sku: `SKU-${i}` }));
    expect(() => Order.create({ customerName: 'Ana', items })).toThrow(DomainError);
  });

  it('não compartilha referência dos itens recebidos', () => {
    const items = [item()];
    const order = Order.create({ customerName: 'Ana', items });
    items[0]!.quantity = 999;
    expect(order.items[0]!.quantity).toBe(2);
  });
});

describe('Order.changeStatus (máquina de estados)', () => {
  const newOrder = () => Order.create({ customerName: 'Ana', items: [item()] });

  it('percorre o caminho feliz até DELIVERED', () => {
    const order = newOrder();
    const later = new Date('2030-01-01T00:00:00Z');
    order.changeStatus('PAID');
    order.changeStatus('SHIPPED');
    order.changeStatus('DELIVERED', later);
    expect(order.status).toBe('DELIVERED');
    expect(order.toJSON().updatedAt).toEqual(later);
  });

  it.each([
    ['PENDING', 'CANCELED'],
    ['PAID', 'CANCELED'],
  ] as const)('permite cancelar a partir de %s', (start, next) => {
    const order = newOrder();
    if (start === 'PAID') order.changeStatus('PAID');
    order.changeStatus(next);
    expect(order.status).toBe('CANCELED');
  });

  it.each([
    [[], 'SHIPPED'],
    [[], 'DELIVERED'],
    [['PAID', 'SHIPPED'], 'CANCELED'],
    [['CANCELED'], 'PAID'],
    [['PAID', 'SHIPPED', 'DELIVERED'], 'PENDING'],
  ] as const)('bloqueia transição inválida (%j → %s)', (path, next) => {
    const order = newOrder();
    path.forEach((s) => order.changeStatus(s));
    const before = order.status;
    expect(order.canTransitionTo(next)).toBe(false);
    expect(() => order.changeStatus(next)).toThrowError(
      expect.objectContaining({ code: 'INVALID_TRANSITION' }),
    );
    expect(order.status).toBe(before);
  });
});

describe('Order.restore', () => {
  it('reconstrói o estado persistido sem reaplicar a criação', () => {
    const props = Order.create({ customerName: 'Ana', items: [item()] }).toJSON();
    const restored = Order.restore({ ...props, status: 'SHIPPED' });
    expect(restored.status).toBe('SHIPPED');
    expect(restored.totalCents).toBe(props.totalCents);
  });
});
