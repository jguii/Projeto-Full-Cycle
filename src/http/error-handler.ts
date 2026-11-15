import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { DomainError, NotFoundError } from '../domain/errors';

/**
 * Traduz erros para respostas no formato application/problem+json (RFC 9457).
 * Erros inesperados viram 500 sem vazar detalhes internos; o detalhe vai para o log.
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const send = (status: number, title: string, detail: string, extra: Record<string, unknown> = {}) =>
    res.status(status).type('application/problem+json').json({ type: 'about:blank', title, status, detail, ...extra });

  if (err instanceof ZodError) {
    return send(400, 'Requisição inválida', 'Um ou mais campos são inválidos.', {
      errors: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  if (err instanceof NotFoundError) return send(404, 'Não encontrado', err.message);
  if (err instanceof DomainError) {
    const status = err.code === 'INVALID_TRANSITION' ? 409 : 422;
    return send(status, 'Regra de negócio violada', err.message, { code: err.code });
  }
  if (err instanceof SyntaxError && 'body' in err) {
    return send(400, 'JSON malformado', 'O corpo da requisição não é um JSON válido.');
  }

  req.log?.error({ err }, 'erro não tratado');
  return send(500, 'Erro interno', 'Ocorreu um erro inesperado.');
};
