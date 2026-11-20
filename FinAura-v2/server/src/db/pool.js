import pg from 'pg';

// Return numeric/bigint as JS numbers where safe. Money columns are numeric(18,x); our magnitudes fit in doubles.
pg.types.setTypeParser(1700, v => (v === null ? null : parseFloat(v)));
pg.types.setTypeParser(20, v => (v === null ? null : parseInt(v, 10)));
// Keep DATE columns as 'YYYY-MM-DD' strings (no timezone shifting)
pg.types.setTypeParser(1082, v => v);

export function createPool(config) {
  return new pg.Pool({
    connectionString: config.DATABASE_URL,
    ssl: config.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
}

/** Run fn inside a transaction. fn receives a client with .query(). */
export async function withTx(pool, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    throw e;
  } finally {
    client.release();
  }
}
