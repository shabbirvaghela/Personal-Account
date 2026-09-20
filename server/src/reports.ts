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

  const dues = works.map((w) => {
    const sums = db
      .prepare(
        `SELECT
          COALESCE(SUM(CASE WHEN type='IN' THEN amount_paise ELSE 0 END), 0) as total_in,
          COALESCE(SUM(CASE WHEN type='OUT' THEN amount_paise ELSE 0 END), 0) as total_out
         FROM transactions WHERE work_id = ? AND deleted_at IS NULL`
      )
      .get(w.id) as { total_in: number; total_out: number };

    const client = db.prepare("SELECT name FROM clients WHERE id = ?").get(w.client_id) as
      | { name: string }
      | undefined;

    const due = w.agreed_fee_paise != null ? w.agreed_fee_paise - sums.total_in : -(sums.total_in - sums.total_out);

    return {
      workId: w.id,
      workTitle: w.title,
      clientId: w.client_id,
      clientName: client?.name || "Unknown",
      agreedFeePaise: w.agreed_fee_paise,
      totalInPaise: sums.total_in,
      totalOutPaise: sums.total_out,
      duePaise: due,
    };
  });

  res.json({ dues: dues.filter((d) => d.duePaise > 0).sort((a, b) => b.duePaise - a.duePaise) });
});

export default router;
