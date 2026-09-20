import { useLiveQuery } from "dexie-react-hooks";
import { Link } from "react-router-dom";
import { localDb } from "../db/localDb";
import { formatRupees } from "../utils/money";

export function DuesPage() {
  const works = useLiveQuery(() => localDb.works.filter((w) => !w.deletedAt).toArray(), []);
  const clients = useLiveQuery(() => localDb.clients.toArray(), []);
  const txns = useLiveQuery(() => localDb.transactions.filter((t) => !t.deletedAt).toArray(), []);

  const clientById = new Map((clients || []).map((c) => [c.id, c]));

  const dues = (works || [])
    .map((w) => {
      const workTxns = (txns || []).filter((t) => t.workId === w.id);
      const totalIn = workTxns.filter((t) => t.type === "IN").reduce((s, t) => s + t.amountPaise, 0);
      const totalOut = workTxns.filter((t) => t.type === "OUT").reduce((s, t) => s + t.amountPaise, 0);
      const due = w.agreedFeePaise != null ? w.agreedFeePaise - totalIn : totalOut - totalIn;
      return { work: w, client: clientById.get(w.clientId), due };
    })
    .filter((d) => d.due > 0)
    .sort((a, b) => b.due - a.due);

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
          <strong>{new Set(dues.map((d) => d.client?.id)).size}</strong>
        </div>
      </div>
      <div className="list">
        {dues.length === 0 && <p className="empty">No outstanding dues 🎉</p>}
        {dues.map((d) => (
          <Link key={d.work.id} to={`/works/${d.work.id}`} className="list-row">
            <div>
              <strong>{d.client?.name || "Unknown client"}</strong>
              <span className="muted"> · {d.work.title}</span>
            </div>
            <strong className="due">{formatRupees(d.due)}</strong>
          </Link>
        ))}
      </div>
    </div>
  );
}
