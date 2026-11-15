import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Pool } from 'pg';
import { loadEnv } from '../../config/env';
import { logger } from '../../observability/logger';
import { createPool } from './pool';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../migrations');

/** Runner mínimo: aplica cada .sql uma única vez, em ordem, registrando em schema_migrations. */
export async function migrate(pool: Pool, dir: string = MIGRATIONS_DIR): Promise<string[]> {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);

  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  const { rows } = await pool.query<{ name: string }>('SELECT name FROM schema_migrations');
  const applied = new Set(rows.map((r) => r.name));
  const executed: string[] = [];

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(path.join(dir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      executed.push(file);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
  return executed;
}

if (require.main === module) {
  const env = loadEnv();
  const pool = createPool(env.DATABASE_URL);
  migrate(pool)
    .then((executed) => logger.info({ executed }, 'migrações aplicadas'))
    .catch((err: unknown) => {
      logger.fatal({ err }, 'falha ao migrar');
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
