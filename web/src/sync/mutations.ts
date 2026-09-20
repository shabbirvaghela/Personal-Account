import { v4 as uuid } from "uuid";
import { localDb, Client, Work, Transaction } from "../db/localDb";
import { syncEngine } from "./syncEngine";

function now() {
  return Date.now();
}

async function enqueue(entity: "client" | "work" | "transaction", entityId: string, op: "create" | "update" | "delete", payload: Record<string, unknown>, baseVersion?: number) {
  await localDb.outbox.put({
    opId: uuid(),
    entity,
    entityId,
    op,
    payload,
    baseVersion,
    attempts: 0,
    createdAt: now(),
  });
  syncEngine.kick();
}

export async function createClient(input: { name: string; phone?: string; address?: string; gstin?: string }): Promise<Client> {
  const id = uuid();
  const ts = now();
  const client: Client = { id, ...input, version: 1, createdAt: ts, updatedAt: ts, syncStatus: "pending" };
  await localDb.clients.put(client);
  await enqueue("client", id, "create", input);
  return client;
}

export async function createWork(input: { clientId: string; title: string; agreedFeePaise?: number | null }): Promise<Work> {
  const id = uuid();
  const ts = now();
  const work: Work = {
    id,
    clientId: input.clientId,
    title: input.title,
    agreedFeePaise: input.agreedFeePaise ?? null,
    status: "open",
    version: 1,
    createdAt: ts,
    updatedAt: ts,
    syncStatus: "pending",
  };
  await localDb.works.put(work);
  await enqueue("work", id, "create", { clientId: input.clientId, title: input.title, agreedFeePaise: input.agreedFeePaise ?? null, status: "open" });
  return work;
}

export async function createTransaction(input: {
  clientId: string;
  workId: string;
  type: "IN" | "OUT";
  amountPaise: number;
  txnDate: number;
  mode: "cash" | "upi" | "bank" | "cheque";
  note?: string;
}): Promise<Transaction> {
  const id = uuid();
  const ts = now();
  const txn: Transaction = { id, ...input, version: 1, createdAt: ts, updatedAt: ts, syncStatus: "pending" };
  await localDb.transactions.put(txn);
  await enqueue("transaction", id, "create", input);
  return txn;
}

export async function deleteTransaction(id: string) {
  const ts = now();
  const existing = await localDb.transactions.get(id);
  await localDb.transactions.update(id, { deletedAt: ts, updatedAt: ts, syncStatus: "pending" });
  await enqueue("transaction", id, "delete", {}, existing?.version);
}
