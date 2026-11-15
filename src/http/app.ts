import { readFileSync } from 'node:fs';
import path from 'node:path';
import express, { type Express } from 'express';
import { pinoHttp } from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import { parse as parseYaml } from 'yaml';
import type { OrderService } from '../application/order-service';
import { logger } from '../observability/logger';
import type { Metrics } from '../observability/metrics';
import { errorHandler } from './error-handler';
import { ordersRouter } from './orders-router';

export interface AppDeps {
  orderService: OrderService;
  metrics: Metrics;
  /** Verifica dependências externas (banco). Usado pelo readiness. */
  checkReadiness: () => Promise<void>;
}

const OPENAPI_PATH = path.resolve(__dirname, '../../docs/openapi.yaml');

/** Composição do app HTTP. Recebe as dependências prontas (injeção por construtor), o que facilita testar. */
export function createApp({ orderService, metrics, checkReadiness }: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));
  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: (req) => req.url === '/metrics' || req.url?.startsWith('/health') === true },
      customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
    }),
  );
  app.use(metrics.httpMetricsMiddleware);

  app.get('/health/live', (_req, res) => {
    res.json({ status: 'ok' });
  });
  app.get('/health/ready', async (_req, res) => {
    try {
      await checkReadiness();
      res.json({ status: 'ok' });
    } catch {
      res.status(503).json({ status: 'unavailable' });
    }
  });
  app.get('/metrics', async (_req, res) => {
    res.type(metrics.registry.contentType).send(await metrics.registry.metrics());
  });

  const spec = parseYaml(readFileSync(OPENAPI_PATH, 'utf8')) as Record<string, unknown>;
  app.get('/openapi.json', (_req, res) => {
    res.json(spec);
  });
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(spec));

  app.use('/orders', ordersRouter(orderService));

  app.use((_req, res) => {
    res.status(404).type('application/problem+json').json({
      type: 'about:blank',
      title: 'Não encontrado',
      status: 404,
      detail: 'Rota inexistente.',
    });
  });
  app.use(errorHandler);
  return app;
}
