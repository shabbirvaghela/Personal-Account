import { useLiveQuery } from "dexie-react-hooks";
import { Link } from "react-router-dom";
import { localDb } from "../db/localDb";
import { formatRupees } from "../utils/money";

interface DueRow {
  key: string;
  linkTo: string;
  clientName: string;
  label: string;
  due: number;
  clientId?: string;
}

export function DuesPage() {
  const works = useLiveQuery(() => localDb.works.filter((w) => !w.deletedAt).toArray(), []);
  const clients = useLiveQuery(() => localDb.clients.filter((c) => !c.deletedAt).toArray(), []);
  const txns = useLiveQuery(() => localDb.transactions.filter((t) => !t.deletedAt).toArray(), []);

  const clientById = new Map((clients || []).map((c) => [c.id, c]));

  const workDues: DueRow[] = (works || [])
    .map((w) => {
      const workTxns = (txns || []).filter((t) => t.workId === w.id);
      const totalIn = workTxns.filter((t) => t.type === "IN").reduce((s, t) => s + t.amountPaise, 0);
      const totalOut = workTxns.filter((t) => t.type === "OUT").reduce((s, t) => s + t.amountPaise, 0);
      const due = w.agreedFeePaise != null ? w.agreedFeePaise - totalIn : totalOut - totalIn;
      return {
        key: `work_${w.id}`,
        linkTo: `/works/${w.id}`,
        clientName: clientById.get(w.clientId)?.name || "Unknown client",
        label: w.title,
        due,
        clientId: w.clientId,
      };
    })
    .filter((d) => d.due > 0);

  // direct client-ledger entries (no separate Work/case)
  const directDues: DueRow[] = (clients || [])
    .map((c) => {
      const clientTxns = (txns || []).filter((t) => t.clientId === c.id && !t.workId);
      const totalIn = clientTxns.filter((t) => t.type === "IN").reduce((s, t) => s + t.amountPaise, 0);
      const totalOut = clientTxns.filter((t) => t.type === "OUT").reduce((s, t) => s + t.amountPaise, 0);
      return {
        key: `client_${c.id}`,
        linkTo: `/clients/${c.id}`,
        clientName: c.name,
        label: "General ledger",
        due: totalOut - totalIn,
        clientId: c.id,
      };
    })
    .filter((d) => d.due > 0);

  const dues = [...directDues, ...workDues].sort((a, b) => b.due - a.due);
  const totalDue = dues.reduce((s, d) => s + d.due, 0);

  return (
    <div className="page">
      <div className="page-header">
        <h2>Dues</h2>
      </div>
      <div className="summary-cards">
        <div className="card">
          <span className="muted">Total outstanding</span>
          <strong className="due">{formatRupees(totalDue)}</strong>
        </div>
        <div className="card">
          <span className="muted">Clients with dues</span>
          <strong>{new Set(dues.map((d) => d.clientId)).size}</strong>
        </div>
      </div>
      <div className="list">
        {dues.length === 0 && <p className="empty">No outstanding dues 🎉</p>}
        {dues.map((d) => (
          <Link key={d.key} to={d.linkTo} className="list-row">
            <div>
              <strong>{d.clientName}</strong>
              <span className="muted"> · {d.label}</span>
            </div>
            <strong className="due">{formatRupees(d.due)}</strong>
          </Link>
        ))}
      </div>
    </div>
  );
}
