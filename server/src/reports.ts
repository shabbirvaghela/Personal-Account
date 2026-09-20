import { Router } from "express";
import { db } from "./db";
import { AuthedRequest, requireAuth } from "./middleware/auth";

const router = Router();
router.use(requireAuth);

// GET /reports/ledger?from=&to=&clientId=&workId=&type=&mode=
router.get("/ledger", (req: AuthedRequest, res) => {
  const ownerId = req.userId!;
  const { from, to, clientId, workId, type, mode } = req.query as Record<string, string | undefined>;

  let sql = "SELECT * FROM transactions WHERE owner_id = ? AND deleted_at IS NULL";
  const params: unknown[] = [ownerId];

  if (from) {
    sql += " AND txn_date >= ?";
    params.push(Number(from));
  }
  if (to) {
    sql += " AND txn_date <= ?";
    params.push(Number(to));
  }
  if (clientId) {
    sql += " AND client_id = ?";
    params.push(clientId);
  }
  if (workId) {
    sql += " AND work_id = ?";
    params.push(workId);
  }
  if (type) {
    sql += " AND type = ?";
    params.push(type);
  }
  if (mode) {
    sql += " AND mode = ?";
    params.push(mode);
  }
  sql += " ORDER BY txn_date DESC";

  const rows = db.prepare(sql).all(...params) as { amount_paise: number; type: string }[];
  const totalIn = rows.filter((r) => r.type === "IN").reduce((s, r) => s + r.amount_paise, 0);
  const totalOut = rows.filter((r) => r.type === "OUT").reduce((s, r) => s + r.amount_paise, 0);

  res.json({ transactions: rows, totals: { in: totalIn, out: totalOut, net: totalIn - totalOut } });
});

// GET /reports/dues
router.get("/dues", (req: AuthedRequest, res) => {
  const ownerId = req.userId!;
  const works = db
    .prepare("SELECT * FROM works WHERE owner_id = ? AND deleted_at IS NULL")
    .all(ownerId) as { id: string; client_id: string; title: string; agreed_fee_paise: number | null }[];

  const clients = db
    .prepare("SELECT * FROM clients WHERE owner_id = ? AND deleted_at IS NULL")
    .all(ownerId) as { id: string; name: string }[];
  const clientById = new Map(clients.map((c) => [c.id, c]));

  const workDues = works.map((w) => {
    const sums = db
      .prepare(
        `SELECT
          COALESCE(SUM(CASE WHEN type='IN' THEN amount_paise ELSE 0 END), 0) as total_in,
          COALESCE(SUM(CASE WHEN type='OUT' THEN amount_paise ELSE 0 END), 0) as total_out
         FROM transactions WHERE work_id = ? AND deleted_at IS NULL`
      )
      .get(w.id) as { total_in: number; total_out: number };

    const due = w.agreed_fee_paise != null ? w.agreed_fee_paise - sums.total_in : sums.total_out - sums.total_in;

    return {
      workId: w.id as string | null,
      workTitle: w.title,
      clientId: w.client_id,
      clientName: clientById.get(w.client_id)?.name || "Unknown",
      agreedFeePaise: w.agreed_fee_paise,
      totalInPaise: sums.total_in,
      totalOutPaise: sums.total_out,
      duePaise: due,
    };
  });

  // direct client-ledger transactions (no work_id) — the common case for
  // free-form per-person ledgers with no separate "case"
  const directSums = db
    .prepare(
      `SELECT client_id,
        COALESCE(SUM(CASE WHEN type='IN' THEN amount_paise ELSE 0 END), 0) as total_in,
        COALESCE(SUM(CASE WHEN type='OUT' THEN amount_paise ELSE 0 END), 0) as total_out
       FROM transactions
       WHERE owner_id = ? AND work_id IS NULL AND deleted_at IS NULL
       GROUP BY client_id`
    )
    .all(ownerId) as { client_id: string; total_in: number; total_out: number }[];

  const directDues = directSums.map((s) => ({
    workId: null as string | null,
    workTitle: "General ledger",
    clientId: s.client_id,
    clientName: clientById.get(s.client_id)?.name || "Unknown",
    agreedFeePaise: null as number | null,
    totalInPaise: s.total_in,
    totalOutPaise: s.total_out,
    duePaise: s.total_out - s.total_in,
  }));

  const dues = [...workDues, ...directDues];
  res.json({ dues: dues.filter((d) => d.duePaise > 0).sort((a, b) => b.duePaise - a.duePaise) });
});

export default router;
