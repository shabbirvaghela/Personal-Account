import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const DB_PATH = process.env.DB_PATH || "./data/legal-ledger.db";
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  google_sub TEXT UNIQUE,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  gstin TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_clients_owner ON clients(owner_id, updated_at);

CREATE TABLE IF NOT EXISTS works (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  title TEXT NOT NULL,
  agreed_fee_paise INTEGER,
  status TEXT NOT NULL DEFAULT 'open',
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_works_owner ON works(owner_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_works_client ON works(client_id);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  work_id TEXT,
  type TEXT NOT NULL CHECK (type IN ('IN','OUT')),
  amount_paise INTEGER NOT NULL,
  txn_date INTEGER NOT NULL,
  mode TEXT NOT NULL DEFAULT 'cash',
  note TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_txn_owner ON transactions(owner_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_txn_work ON transactions(work_id, txn_date);
CREATE INDEX IF NOT EXISTS idx_txn_client ON transactions(client_id, txn_date);

CREATE TABLE IF NOT EXISTS applied_ops (
  op_id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  applied_at INTEGER NOT NULL
);
`);
