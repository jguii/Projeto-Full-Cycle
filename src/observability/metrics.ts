import type { RequestHandler } from 'express';
import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';
import type { OrderEvents } from '../application/order-service';

/**
 * Métrica principal (base do SLO): latência das requisições HTTP por rota/método/status.
 * Os buckets incluem 0.3 s para que a fração "dentro do SLO" saia direto do histograma.
 */
export function createMetrics() {
  const registry = new Registry();
  collectDefaultMetrics({ register: registry, prefix: 'api_pedidos_' });

  const httpDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duração das requisições HTTP em segundos',
    labelNames: ['method', 'route', 'status_code'] as const,
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.3, 0.5, 1, 2.5],
    registers: [registry],
  });

  const ordersCreated = new Counter({
    name: 'orders_created_total',
    help: 'Total de pedidos criados',
    registers: [registry],
  });

  const orderTransitions = new Counter({
    name: 'order_status_transitions_total',
    help: 'Transições de status de pedido',
    labelNames: ['from', 'to'] as const,
    registers: [registry],
  });

  const httpMetricsMiddleware: RequestHandler = (req, res, next) => {
    const end = httpDuration.startTimer();
    res.on('finish', () => {
      // Usa o padrão da rota (/orders/:id), não a URL real, para não explodir a cardinalidade.
      const route = req.route?.path
        ? `${req.baseUrl}${String(req.route.path)}`.replace(/(.)\/$/, '$1')
        : 'unmatched';
      end({ method: req.method, route, status_code: String(res.statusCode) });
    });
    next();
  };

  const orderEvents: OrderEvents = {
    orderCreated: () => ordersCreated.inc(),
    orderStatusChanged: (order, from) => orderTransitions.inc({ from, to: order.status }),
  };

  return { registry, httpMetricsMiddleware, orderEvents };
}

export type Metrics = ReturnType<typeof createMetrics>;
