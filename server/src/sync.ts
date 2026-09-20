import { Router } from "express";
import { db } from "./db";
import { AuthedRequest, requireAuth } from "./middleware/auth";

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

// POST /sync/push  { ops: PushOp[] }
router.post("/push", (req: AuthedRequest, res) => {
  const ownerId = req.userId!;
  const ops: PushOp[] = req.body?.ops || [];
  const results: Record<string, { status: string; version?: number; reason?: string }> = {};

  const tx = db.transaction((ops: PushOp[]) => {
    for (const op of ops) {
      const already = db
        .prepare("SELECT op_id FROM applied_ops WHERE op_id = ?")
        .get(op.opId);
      if (already) {
        results[op.opId] = { status: "applied" };
        continue;
      }

      const table = TABLE[op.entity];
      const cols = COLUMNS[op.entity];
      if (!table) {
        results[op.opId] = { status: "rejected", reason: "unknown_entity" };
        continue;
      }

      const now = Date.now();
      const existing = db
        .prepare(`SELECT * FROM ${table} WHERE id = ? AND owner_id = ?`)
        .get(op.entityId, ownerId) as { version: number } | undefined;

      if (op.op === "delete") {
        if (existing) {
          db.prepare(`UPDATE ${table} SET deleted_at = ?, updated_at = ?, version = version + 1 WHERE id = ?`).run(
            now,
            now,
            op.entityId
          );
        }
        db.prepare("INSERT INTO applied_ops (op_id, owner_id, applied_at) VALUES (?, ?, ?)").run(op.opId, ownerId, now);
        results[op.opId] = { status: "applied" };
        continue;
      }

      if (existing && op.baseVersion !== undefined && op.baseVersion < existing.version) {
        results[op.opId] = { status: "conflict", version: existing.version };
        continue;
      }

      const snake = camelToSnake(op.payload);
      const values = cols.map((c) => snake[c] ?? null);

      if (existing) {
        const setClause = cols.map((c) => `${c} = ?`).join(", ");
        db.prepare(
          `UPDATE ${table} SET ${setClause}, updated_at = ?, version = version + 1 WHERE id = ?`
        ).run(...values, now, op.entityId);
        const row = db.prepare(`SELECT version FROM ${table} WHERE id = ?`).get(op.entityId) as { version: number };
        results[op.opId] = { status: "applied", version: row.version };
      } else {
        const insertCols = ["id", "owner_id", ...cols, "version", "created_at", "updated_at"];
        const placeholders = insertCols.map(() => "?").join(", ");
        db.prepare(`INSERT INTO ${table} (${insertCols.join(", ")}) VALUES (${placeholders})`).run(
          op.entityId,
          ownerId,
          ...values,
          1,
          now,
          now
        );
        results[op.opId] = { status: "applied", version: 1 };
      }

      db.prepare("INSERT INTO applied_ops (op_id, owner_id, applied_at) VALUES (?, ?, ?)").run(op.opId, ownerId, now);
    }
  });

  tx(ops);
  res.json({ results });
});

// GET /sync/pull?since=<timestamp>
router.get("/pull", (req: AuthedRequest, res) => {
  const ownerId = req.userId!;
  const since = Number(req.query.since || 0);
  const now = Date.now();

  const clients = db
    .prepare("SELECT * FROM clients WHERE owner_id = ? AND updated_at > ?")
    .all(ownerId, since);
  const works = db
    .prepare("SELECT * FROM works WHERE owner_id = ? AND updated_at > ?")
    .all(ownerId, since);
  const transactions = db
    .prepare("SELECT * FROM transactions WHERE owner_id = ? AND updated_at > ?")
    .all(ownerId, since);

  res.json({ changes: { clients, works, transactions }, cursor: now });
});

export default router;
