import { describe, expect, it } from 'vitest';
import { loadEnv } from '../../src/config/env';

describe('loadEnv', () => {
  it('aplica defaults e converte tipos', () => {
    const env = loadEnv({ DATABASE_URL: 'postgres://u:p@localhost:5432/db', PORT: '8080' });
    expect(env).toEqual({
      NODE_ENV: 'development',
      PORT: 8080,
      LOG_LEVEL: 'info',
      DATABASE_URL: 'postgres://u:p@localhost:5432/db',
    });
  });

  it('falha rápido sem DATABASE_URL e sem vazar valores', () => {
    expect(() => loadEnv({ PORT: 'abc' })).toThrow(/Configuração inválida: .*PORT.*DATABASE_URL/);
  });

  it('rejeita DATABASE_URL que não é Postgres', () => {
    expect(() => loadEnv({ DATABASE_URL: 'mysql://localhost/db' })).toThrow(/DATABASE_URL/);
  });
});
