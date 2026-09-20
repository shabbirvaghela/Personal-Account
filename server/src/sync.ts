import { Router } from "express";
import { PoolClient } from "pg";
import { pool } from "./db";
import { AuthedRequest, requireAuth } from "./middleware/auth";
import { ah } from "./asyncHandler";

const router = Router();
router.use(requireAuth);

type Entity = "client" | "work" | "transaction";
type OpType = "create" | "update" | "delete";

interface PushOp {
  opId: string;
  entity: Entity;
  entityId: string;
  op: OpType;
  baseVersion?: number;
  payload: Record<string, unknown>;
}

const TABLE: Record<Entity, string> = {
  client: "clients",
  work: "works",
  transaction: "transactions",
};

const COLUMNS: Record<Entity, string[]> = {
  client: ["name", "phone", "address", "gstin"],
  work: ["client_id", "title", "agreed_fee_paise", "status"],
  transaction: ["client_id", "work_id", "type", "amount_paise", "txn_date", "mode", "note"],
};

function camelToSnake(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k.replace(/[A-Z]/g, (m) => "_" + m.toLowerCase())] = v;
  }
  return out;
}

async function applyOp(
  client: PoolClient,
  ownerId: string,
  op: PushOp,
  results: Record<string, { status: string; version?: number; reason?: string }>
) {
  const already = await client.query("SELECT op_id FROM applied_ops WHERE op_id = $1", [op.opId]);
  if (already.rows.length > 0) {
    results[op.opId] = { status: "applied" };
    return;
  }

  const table = TABLE[op.entity];
  const cols = COLUMNS[op.entity];
  if (!table) {
    results[op.opId] = { status: "rejected", reason: "unknown_entity" };
    return;
  }

  const now = Date.now();
  const existingResult = await client.query<{ version: number }>(
    `SELECT version FROM ${table} WHERE id = $1 AND owner_id = $2`,
    [op.entityId, ownerId]
  );
  const existing = existingResult.rows[0];

  if (op.op === "delete") {
    if (existing) {
      await client.query(
        `UPDATE ${table} SET deleted_at = $1, updated_at = $2, version = version + 1 WHERE id = $3`,
        [now, now, op.entityId]
      );
    }
    await client.query("INSERT INTO applied_ops (op_id, owner_id, applied_at) VALUES ($1, $2, $3)", [
      op.opId,
      ownerId,
      now,
    ]);
    results[op.opId] = { status: "applied" };
    return;
  }

  if (existing && op.baseVersion !== undefined && op.baseVersion < existing.version) {
    results[op.opId] = { status: "conflict", version: existing.version };
    return;
  }

  const snake = camelToSnake(op.payload);
  const values = cols.map((c) => snake[c] ?? null);

  if (existing) {
    const setClause = cols.map((c, i) => `${c} = $${i + 1}`).join(", ");
    const updated = await client.query<{ version: number }>(
      `UPDATE ${table} SET ${setClause}, updated_at = $${cols.length + 1}, version = version + 1
       WHERE id = $${cols.length + 2} RETURNING version`,
      [...values, now, op.entityId]
    );
    results[op.opId] = { status: "applied", version: updated.rows[0].version };
  } else {
    const insertCols = ["id", "owner_id", ...cols, "version", "created_at", "updated_at"];
    const insertValues = [op.entityId, ownerId, ...values, 1, now, now];
    const placeholders = insertValues.map((_, i) => `$${i + 1}`).join(", ");
    await client.query(`INSERT INTO ${table} (${insertCols.join(", ")}) VALUES (${placeholders})`, insertValues);
    results[op.opId] = { status: "applied", version: 1 };
  }

  await client.query("INSERT INTO applied_ops (op_id, owner_id, applied_at) VALUES ($1, $2, $3)", [
    op.opId,
    ownerId,
    now,
  ]);
}

// POST /sync/push  { ops: PushOp[] }
router.post("/push", ah(async (req: AuthedRequest, res) => {
  const ownerId = req.userId!;
  const ops: PushOp[] = req.body?.ops || [];
  const results: Record<string, { status: string; version?: number; reason?: string }> = {};

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const op of ops) {
      await applyOp(client, ownerId, op, results);
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  res.json({ results });
}));

// GET /sync/pull?since=<timestamp>
router.get("/pull", ah(async (req: AuthedRequest, res) => {
  const ownerId = req.userId!;
  const since = Number(req.query.since || 0);
  const now = Date.now();

  const [clients, works, transactions] = await Promise.all([
    pool.query("SELECT * FROM clients WHERE owner_id = $1 AND updated_at > $2", [ownerId, since]),
    pool.query("SELECT * FROM works WHERE owner_id = $1 AND updated_at > $2", [ownerId, since]),
    pool.query("SELECT * FROM transactions WHERE owner_id = $1 AND updated_at > $2", [ownerId, since]),
  ]);

  res.json({
    changes: { clients: clients.rows, works: works.rows, transactions: transactions.rows },
    cursor: now,
  });
}));

export default router;
