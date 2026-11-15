import { OrderService } from './application/order-service';
import { loadEnv } from './config/env';
import { createPool } from './infra/db/pool';
import { PostgresOrderRepository } from './infra/repositories/postgres-order-repository';
import { createApp } from './http/app';
import { logger } from './observability/logger';
import { createMetrics } from './observability/metrics';

/** Composition root: único lugar que conhece as implementações concretas. */
function main(): void {
  const env = loadEnv();
  const pool = createPool(env.DATABASE_URL);
  const metrics = createMetrics();
  const orderService = new OrderService(new PostgresOrderRepository(pool), metrics.orderEvents);

  const app = createApp({
    orderService,
    metrics,
    checkReadiness: async () => {
      await pool.query('SELECT 1');
    },
  });

  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, 'api-pedidos no ar');
  });

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'encerrando');
    server.close(() => {
      pool.end().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main();
