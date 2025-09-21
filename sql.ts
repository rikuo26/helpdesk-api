import * as sql from "mssql";

export function getSqlConfig(): sql.config {
  const { SQL_SERVER, SQL_DB, SQL_USER, SQL_PASSWORD } = process.env as Record<string, string | undefined>;
  if (!SQL_SERVER || !SQL_DB || !SQL_USER || !SQL_PASSWORD) {
    throw new Error("Missing SQL envs: SQL_SERVER/SQL_DB/SQL_USER/SQL_PASSWORD");
  }
  return {
    server: SQL_SERVER,
    database: SQL_DB,
    user: SQL_USER,
    password: SQL_PASSWORD,
    options: { encrypt: true, trustServerCertificate: false },
  } as sql.config;
}

/** コネクションプールのライフサイクルを隠蔽 */
export async function withPool<T>(fn: (pool: sql.ConnectionPool) => Promise<T>): Promise<T> {
  const pool = await new sql.ConnectionPool(getSqlConfig()).connect();
  try {
    return await fn(pool);
  } finally {
    await pool.close();
  }
}
