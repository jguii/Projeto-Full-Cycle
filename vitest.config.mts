import { defineConfig } from 'vitest/config';

/**
 * Coverage mínimo DECLARADO (exigência M2 do Projeto B).
 * Medido sobre os testes unitários; se cair abaixo disso, `npm run test:unit` falha e a CI fica vermelha.
 * Ficam de fora apenas arquivos de bootstrap/infra que são exercitados pelo teste de integração.
 */
const COVERAGE_THRESHOLDS = {
  lines: 80,
  functions: 80,
  branches: 75,
  statements: 80,
};

export default defineConfig({
  test: {
    env: { LOG_LEVEL: 'silent', NODE_ENV: 'test' },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/server.ts', 'src/infra/db/**', 'src/infra/repositories/postgres-order-repository.ts'],
      reporter: ['text', 'html', 'json-summary'],
      thresholds: COVERAGE_THRESHOLDS,
    },
    projects: [
      {
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          environment: 'node',
          testTimeout: 20_000,
          fileParallelism: false,
        },
      },
    ],
  },
});
