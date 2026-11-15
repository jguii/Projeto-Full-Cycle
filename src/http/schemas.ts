import { z } from 'zod';
import { MAX_ITEMS_PER_ORDER, ORDER_STATUSES } from '../domain/order';

/** Validação de formato na borda (HTTP). Regras de negócio ficam na entidade. */
export const createOrderSchema = z.object({
  customerName: z.string().trim().min(1).max(120),
  items: z
    .array(
      z.object({
        sku: z.string().trim().min(1).max(64),
        name: z.string().trim().min(1).max(120),
        quantity: z.number().int().positive().max(1000),
        unitPriceCents: z.number().int().nonnegative().max(100_000_000),
      }),
    )
    .min(1)
    .max(MAX_ITEMS_PER_ORDER),
});

export const changeStatusSchema = z.object({
  status: z.enum(ORDER_STATUSES),
});

export const listOrdersSchema = z.object({
  status: z.enum(ORDER_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const idParamSchema = z.object({ id: z.uuid() });
