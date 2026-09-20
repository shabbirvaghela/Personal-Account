import { Pool, types } from "pg";

// pg returns BIGINT (OID 20) and NUMERIC (OID 1700, what SUM(bigint) produces)
// as strings by default, to avoid precision loss for values beyond
// Number.MAX_SAFE_INTEGER. Our BIGINT columns are ms timestamps and paise
// amounts, and our SUM()s are totals over those same amounts — all safely
// within that range for this app's lifetime — and the frontend expects plain
// numbers in the JSON it already works with, so decode both as numbers here
// instead of touching every caller.
types.setTypeParser(20, (val: string) => parseInt(val, 10));
types.setTypeParser(1700, (val: string) => parseFloat(val));

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is required (Supabase connection string, or any Postgres)");
}

// Supabase's pooled ("Transaction pooler", port 6543) connection string needs
// sslmode handled by the driver, not the URL — ssl: { rejectUnauthorized: false }
// works for Supabase's managed certs from any serverless/short-lived client.
export const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL.includes("localhost") ? undefined : { rejectUnauthorized: false },
  max: process.env.VERCEL ? 1 : 10,
});

export async function initSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT,
      google_sub TEXT UNIQUE,
      created_at BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      name TEXT NOT NULL,
      phone TEXT,
      address TEXT,
      gstin TEXT,
      version INTEGER NOT NULL DEFAULT 1,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      deleted_at BIGINT
    );
    CREATE INDEX IF NOT EXISTS idx_clients_owner ON clients(owner_id, updated_at);

    CREATE TABLE IF NOT EXISTS works (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      client_id TEXT NOT NULL,
      title TEXT NOT NULL,
      agreed_fee_paise BIGINT,
      status TEXT NOT NULL DEFAULT 'open',
      version INTEGER NOT NULL DEFAULT 1,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      deleted_at BIGINT
    );
    CREATE INDEX IF NOT EXISTS idx_works_owner ON works(owner_id, updated_at);
    CREATE INDEX IF NOT EXISTS idx_works_client ON works(client_id);

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      client_id TEXT NOT NULL,
      work_id TEXT,
      type TEXT NOT NULL CHECK (type IN ('IN','OUT')),
      amount_paise BIGINT NOT NULL,
      txn_date BIGINT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'cash',
      note TEXT,
      version INTEGER NOT NULL DEFAULT 1,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      deleted_at BIGINT
    );
    CREATE INDEX IF NOT EXISTS idx_txn_owner ON transactions(owner_id, updated_at);
    CREATE INDEX IF NOT EXISTS idx_txn_work ON transactions(work_id, txn_date);
    CREATE INDEX IF NOT EXISTS idx_txn_client ON transactions(client_id, txn_date);

    CREATE TABLE IF NOT EXISTS applied_ops (
      op_id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      applied_at BIGINT NOT NULL
    );
  `);
}
