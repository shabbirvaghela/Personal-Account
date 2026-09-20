import Dexie, { Table } from "dexie";

export type SyncStatus = "pending" | "synced" | "error";

export interface Client {
  id: string;
  name: string;
  phone?: string;
  address?: string;
  gstin?: string;
  version: number;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number | null;
  syncStatus: SyncStatus;
}

export interface Work {
  id: string;
  clientId: string;
  title: string;
  agreedFeePaise?: number | null;
  status: "open" | "closed";
  version: number;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number | null;
  syncStatus: SyncStatus;
}

export interface Transaction {
  id: string;
  clientId: string;
  workId?: string | null;
  type: "IN" | "OUT";
  amountPaise: number;
  txnDate: number;
  mode: "cash" | "upi" | "bank" | "cheque";
  note?: string;
  version: number;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number | null;
  syncStatus: SyncStatus;
}

export type Entity = "client" | "work" | "transaction";
export type OpType = "create" | "update" | "delete";

export interface OutboxOp {
  opId: string;
  entity: Entity;
  entityId: string;
  op: OpType;
  payload: Record<string, unknown>;
  baseVersion?: number;
  attempts: number;
  lastError?: string;
  createdAt: number;
}

export interface Meta {
  key: string;
  value: string | number;
}

class LedgerDB extends Dexie {
  clients!: Table<Client, string>;
  works!: Table<Work, string>;
  transactions!: Table<Transaction, string>;
  outbox!: Table<OutboxOp, string>;
  meta!: Table<Meta, string>;

  constructor() {
    super("legal-ledger");
    this.version(1).stores({
      clients: "id, name, updatedAt, syncStatus, deletedAt",
      works: "id, clientId, updatedAt, syncStatus, deletedAt",
      transactions: "id, clientId, workId, txnDate, type, updatedAt, syncStatus, deletedAt",
      outbox: "opId, entity, entityId, createdAt",
      meta: "key",
    });
  }
}

export const localDb = new LedgerDB();

export async function getMeta(key: string): Promise<string | number | undefined> {
  const row = await localDb.meta.get(key);
  return row?.value;
}

export async function setMeta(key: string, value: string | number) {
  await localDb.meta.put({ key, value });
}
