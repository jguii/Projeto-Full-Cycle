import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OrderService, type OrderEvents } from '../../src/application/order-service';
import { NotFoundError } from '../../src/domain/errors';
import { InMemoryOrderRepository } from '../../src/infra/repositories/in-memory-order-repository';

const input = {
  customerName: 'Maria',
  items: [{ sku: 'A', name: 'Produto A', quantity: 3, unitPriceCents: 1000 }],
};

describe('OrderService', () => {
  let repo: InMemoryOrderRepository;
  let events: OrderEvents;
  let service: OrderService;
  let clock: Date;

  beforeEach(() => {
    repo = new InMemoryOrderRepository();
    events = { orderCreated: vi.fn(), orderStatusChanged: vi.fn() };
    clock = new Date('2026-11-01T12:00:00Z');
    service = new OrderService(repo, events, () => clock);
  });

  it('cria, persiste e emite evento', async () => {
    const order = await service.create(input);

    expect(order.totalCents).toBe(3000);
    expect(await repo.findById(order.id)).not.toBeNull();
    expect(events.orderCreated).toHaveBeenCalledWith(order);
  });

  it('busca por id', async () => {
    const created = await service.create(input);
    const found = await service.getById(created.id);
    expect(found.toJSON()).toEqual(created.toJSON());
  });

  it('lança NotFoundError para id inexistente', async () => {
    await expect(service.getById('00000000-0000-0000-0000-000000000000')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('muda status, persiste e emite evento com o status anterior', async () => {
    const created = await service.create(input);
    clock = new Date('2026-11-02T12:00:00Z');

    const updated = await service.changeStatus(created.id, 'PAID');

    expect(updated.status).toBe('PAID');
    expect((await repo.findById(created.id))?.toJSON()).toMatchObject({ status: 'PAID', updatedAt: clock });
    expect(events.orderStatusChanged).toHaveBeenCalledWith(updated, 'PENDING');
  });

  it('não persiste nem emite evento quando a transição é inválida', async () => {
    const created = await service.create(input);
    await expect(service.changeStatus(created.id, 'DELIVERED')).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
    expect((await repo.findById(created.id))?.status).toBe('PENDING');
    expect(events.orderStatusChanged).not.toHaveBeenCalled();
  });

  it('lista com filtro de status e paginação, mais recentes primeiro', async () => {
    const first = await service.create(input);
    clock = new Date('2026-11-01T13:00:00Z');
    const second = await service.create(input);
    clock = new Date('2026-11-01T14:00:00Z');
    const third = await service.create(input);
    await service.changeStatus(second.id, 'PAID');

    const all = await service.list({ limit: 2, offset: 0 });
    expect(all.total).toBe(3);
    expect(all.data.map((o) => o.id)).toEqual([third.id, second.id]);

    const pending = await service.list({ status: 'PENDING', limit: 10, offset: 1 });
    expect(pending.total).toBe(2);
    expect(pending.data.map((o) => o.id)).toEqual([first.id]);
  });

  it('funciona sem observador de eventos (default no-op)', async () => {
    const plain = new OrderService(new InMemoryOrderRepository());
    const order = await plain.create(input);
    await expect(plain.changeStatus(order.id, 'CANCELED')).resolves.toMatchObject({ status: 'CANCELED' });
  });
});
