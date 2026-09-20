import { FormEvent, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Link, useParams } from "react-router-dom";
import { localDb } from "../db/localDb";
import { createWork, deleteTransaction } from "../sync/mutations";
import { formatRupees, toPaise } from "../utils/money";
import { QuickAddPanel } from "../components/QuickAddPanel";
import { FilterBar } from "../components/FilterBar";
import { FilterPeriod, rangeForPeriod } from "../utils/dateFilters";

export function ClientDetailPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const client = useLiveQuery(() => localDb.clients.get(clientId!), [clientId]);
  const works = useLiveQuery(
    () => localDb.works.filter((w) => w.clientId === clientId && !w.deletedAt).sortBy("createdAt"),
    [clientId]
  );

  // Direct ledger: transactions on this client with no separate Work/case —
  // the common case for a simple person-to-person account.
  const allDirectTxns = useLiveQuery(
    () => localDb.transactions.filter((t) => t.clientId === clientId && !t.workId && !t.deletedAt).sortBy("txnDate"),
    [clientId]
  );

  const [period, setPeriod] = useState<FilterPeriod>("all");
  const range = rangeForPeriod(period);
  const directTxns = (allDirectTxns || [])
    .filter((t) => !range || (t.txnDate >= range.from && t.txnDate <= range.to))
    .reverse();

  const totalIn = directTxns.filter((t) => t.type === "IN").reduce((s, t) => s + t.amountPaise, 0);
  const totalOut = directTxns.filter((t) => t.type === "OUT").reduce((s, t) => s + t.amountPaise, 0);
  const balance = totalOut - totalIn;

  const [showWorkForm, setShowWorkForm] = useState(false);
  const [title, setTitle] = useState("");
  const [fee, setFee] = useState("");

  async function onAddWork(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || !clientId) return;
    await createWork({ clientId, title: title.trim(), agreedFeePaise: fee ? toPaise(Number(fee)) : null });
    setTitle("");
    setFee("");
    setShowWorkForm(false);
  }

  if (!clientId) return null;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <Link to="/" className="back-link">← Clients</Link>
          <h2>{client?.name || "…"}</h2>
        </div>
      </div>

      <div className="summary-cards">
        <div className="card">
          <span className="muted">Received</span>
          <strong className="in">{formatRupees(totalIn)}</strong>
        </div>
        <div className="card">
          <span className="muted">Paid out</span>
          <strong className="out">{formatRupees(totalOut)}</strong>
        </div>
        <div className="card">
          <span className="muted">{balance > 0 ? "Balance due" : "Net"}</span>
          <strong className={balance > 0 ? "due" : "in"}>{formatRupees(Math.abs(balance))}</strong>
        </div>
      </div>

      <QuickAddPanel clientId={clientId} workId={null} />

      <FilterBar value={period} onChange={setPeriod} />

      <div className="list">
        {directTxns.length === 0 && <p className="empty">No entries yet — add one above.</p>}
        {directTxns.map((t) => (
          <div key={t.id} className="list-row">
            <div>
              <strong className={t.type === "IN" ? "in" : "out"}>
                {t.type === "IN" ? "+" : "-"}
                {formatRupees(t.amountPaise)}
              </strong>
              <span className="muted"> · {new Date(t.txnDate).toLocaleDateString("en-IN")}</span>
              {t.note && <span className="muted"> · {t.note}</span>}
            </div>
            <div className="row-actions">
              {t.syncStatus === "pending" && <span className="dot-pending" title="Not synced yet" />}
              <button className="link-btn danger" onClick={() => deleteTransaction(t.id)}>
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="page-header" style={{ marginTop: 24 }}>
        <h3 style={{ margin: 0 }}>Case-wise work items</h3>
        <button onClick={() => setShowWorkForm((s) => !s)}>{showWorkForm ? "Cancel" : "+ Add work"}</button>
      </div>
      <p className="muted" style={{ marginTop: -6 }}>Optional — use this only if you want to track a specific case separately with its own fee/dues.</p>

      {showWorkForm && (
        <form className="inline-form" onSubmit={onAddWork}>
          <input placeholder="Work / case title" value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus />
          <input placeholder="Agreed fee ₹ (optional)" type="number" value={fee} onChange={(e) => setFee(e.target.value)} />
          <button type="submit">Save</button>
        </form>
      )}

      <div className="list">
        {works?.map((w) => (
          <Link key={w.id} to={`/works/${w.id}`} className="list-row">
            <div>
              <strong>{w.title}</strong>
              {w.agreedFeePaise != null && <span className="muted"> · Fee {formatRupees(w.agreedFeePaise)}</span>}
            </div>
            {w.syncStatus === "pending" && <span className="dot-pending" title="Not synced yet" />}
          </Link>
        ))}
      </div>
    </div>
  );
}
