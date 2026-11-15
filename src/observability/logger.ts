import pino from 'pino';

/**
 * Logs estruturados em JSON (um objeto por linha). Em desenvolvimento dá para
 * deixar legível com `npm run dev | npx pino-pretty`.
 * Campos sensíveis são removidos antes de sair do processo.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: { service: 'api-pedidos', env: process.env.NODE_ENV ?? 'development' },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.DATABASE_URL'],
    censor: '[REDACTED]',
  },
});
