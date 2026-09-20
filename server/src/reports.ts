import { Router } from "express";
import { pool } from "./db";
import { AuthedRequest, requireAuth } from "./middleware/auth";
import { ah } from "./asyncHandler";

const router = Router();
router.use(requireAuth);

// GET /reports/ledger?from=&to=&clientId=&workId=&type=&mode=
router.get("/ledger", ah(async (req: AuthedRequest, res) => {
  const ownerId = req.userId!;
  const { from, to, clientId, workId, type, mode } = req.query as Record<string, string | undefined>;

  let sql = "SELECT * FROM transactions WHERE owner_id = $1 AND deleted_at IS NULL";
  const params: unknown[] = [ownerId];

  if (from) {
    params.push(Number(from));
    sql += ` AND txn_date >= $${params.length}`;
  }
  if (to) {
    params.push(Number(to));
    sql += ` AND txn_date <= $${params.length}`;
  }
  if (clientId) {
    params.push(clientId);
    sql += ` AND client_id = $${params.length}`;
  }
  if (workId) {
    params.push(workId);
    sql += ` AND work_id = $${params.length}`;
  }
  if (type) {
    params.push(type);
    sql += ` AND type = $${params.length}`;
  }
  if (mode) {
    params.push(mode);
    sql += ` AND mode = $${params.length}`;
  }
  sql += " ORDER BY txn_date DESC";

  const result = await pool.query<{ amount_paise: number; type: string }>(sql, params);
  const rows = result.rows;
  const totalIn = rows.filter((r) => r.type === "IN").reduce((s, r) => s + r.amount_paise, 0);
  const totalOut = rows.filter((r) => r.type === "OUT").reduce((s, r) => s + r.amount_paise, 0);

  res.json({ transactions: rows, totals: { in: totalIn, out: totalOut, net: totalIn - totalOut } });
}));

// GET /reports/dues
router.get("/dues", ah(async (req: AuthedRequest, res) => {
  const ownerId = req.userId!;

  const [worksResult, clientsResult] = await Promise.all([
    pool.query<{ id: string; client_id: string; title: string; agreed_fee_paise: number | null }>(
      "SELECT * FROM works WHERE owner_id = $1 AND deleted_at IS NULL",
      [ownerId]
    ),
    pool.query<{ id: string; name: string }>("SELECT * FROM clients WHERE owner_id = $1 AND deleted_at IS NULL", [
      ownerId,
    ]),
  ]);
  const works = worksResult.rows;
  const clientById = new Map(clientsResult.rows.map((c) => [c.id, c]));

  const workDues = await Promise.all(
    works.map(async (w) => {
      const sumsResult = await pool.query<{ total_in: number; total_out: number }>(
        `SELECT
          COALESCE(SUM(CASE WHEN type='IN' THEN amount_paise ELSE 0 END), 0) as total_in,
          COALESCE(SUM(CASE WHEN type='OUT' THEN amount_paise ELSE 0 END), 0) as total_out
         FROM transactions WHERE work_id = $1 AND deleted_at IS NULL`,
        [w.id]
      );
      const sums = sumsResult.rows[0];
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
    })
  );

  // direct client-ledger transactions (no work_id) — the common case for
  // free-form per-person ledgers with no separate "case"
  const directResult = await pool.query<{ client_id: string; total_in: number; total_out: number }>(
    `SELECT client_id,
      COALESCE(SUM(CASE WHEN type='IN' THEN amount_paise ELSE 0 END), 0) as total_in,
      COALESCE(SUM(CASE WHEN type='OUT' THEN amount_paise ELSE 0 END), 0) as total_out
     FROM transactions
     WHERE owner_id = $1 AND work_id IS NULL AND deleted_at IS NULL
     GROUP BY client_id`,
    [ownerId]
  );

  const directDues = directResult.rows.map((s) => ({
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
}));

export default router;
