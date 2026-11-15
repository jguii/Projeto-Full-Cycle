import { Router } from 'express';
import type { OrderService } from '../application/order-service';
import { changeStatusSchema, createOrderSchema, idParamSchema, listOrdersSchema } from './schemas';

/** Controller fino: valida entrada, chama o caso de uso, serializa a saída. */
export function ordersRouter(service: OrderService): Router {
  const router = Router();

  router.post('/', async (req, res) => {
    const input = createOrderSchema.parse(req.body);
    const order = await service.create(input);
    res.status(201).location(`/orders/${order.id}`).json(order.toJSON());
  });

  router.get('/', async (req, res) => {
    const query = listOrdersSchema.parse(req.query);
    const { data, total } = await service.list(query);
    res.json({ data: data.map((o) => o.toJSON()), total, limit: query.limit, offset: query.offset });
  });

  router.get('/:id', async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const order = await service.getById(id);
    res.json(order.toJSON());
  });

  router.patch('/:id/status', async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    const { status } = changeStatusSchema.parse(req.body);
    const order = await service.changeStatus(id, status);
    res.json(order.toJSON());
  });

  return router;
}
