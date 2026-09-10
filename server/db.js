/**
 * db.js — Capa de acceso a datos.
 *
 * Usa PostgreSQL cuando hay DATABASE_URL/POSTGRES_URL (deploy en Vercel/Neon)
 * y PGlite (Postgres en WASM, archivo local) cuando no la hay (desarrollo).
 * Ambos hablan el mismo dialecto SQL y usan placeholders $1, $2, …
 *
 * Interfaz: q(sql, params) -> Promise<{ rows }>
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONN =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  null;

export const USING_POSTGRES = Boolean(CONN);

let backend = null;   // { query(sql, params), exec(sql) }
let readyPromise = null;

async function makeBackend() {
  if (CONN) {
    const { default: pg } = await import('pg');
    const pool = new pg.Pool({
      connectionString: CONN,
      max: 3,
      ssl: /localhost|127\.0\.0\.1/.test(CONN) ? undefined : { rejectUnauthorized: false },
    });
    return {
      query: (sql, params) => pool.query(sql, params),
      exec: (sql) => pool.query(sql),
    };
  }
  const { PGlite } = await import('@electric-sql/pglite');
  // En Vercel sin Postgres: BD efímera en /tmp (se pierde entre arranques en frío;
  // sirve para probar). En local: archivo persistente en server/data/pgdata.
  const dir = process.env.SGEO_DB_DIR
    || (process.env.VERCEL ? '/tmp/sgeo-pgdata' : join(__dirname, 'data', 'pgdata'));
  const lite = new PGlite(dir);
  await lite.waitReady;
  return {
    query: (sql, params) => lite.query(sql, params),
    exec: (sql) => lite.exec(sql),
  };
}

async function init() {
  backend = await makeBackend();
  await backend.exec(readFileSync(join(__dirname, 'schema.sql'), 'utf8'));
  // Migración: valoración "Cumple parcialmente" pasó de "PC" a "CP".
  await backend.exec(`
    ALTER TABLE audit_items DROP CONSTRAINT IF EXISTS audit_items_valoracion_check;
    UPDATE audit_items SET valoracion = 'CP' WHERE valoracion = 'PC';
    ALTER TABLE audit_items ADD CONSTRAINT audit_items_valoracion_check
      CHECK (valoracion IN ('C','CP','NC','NA'));
  `).catch(() => {});
}

/** Garantiza el esquema una sola vez por instancia. (El sembrado lo hace seed.js.) */
export function ready() {
  if (!readyPromise) readyPromise = init();
  return readyPromise;
}

/** Ejecuta una consulta (espera a que el esquema esté listo). */
export async function q(sql, params = []) {
  await ready();
  return backend.query(sql, params);
}

/** Helpers de conveniencia. */
export const one = async (sql, params) => (await q(sql, params)).rows[0] || null;
export const many = async (sql, params) => (await q(sql, params)).rows;
