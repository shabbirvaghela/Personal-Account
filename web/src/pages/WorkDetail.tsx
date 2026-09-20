import { FormEvent, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Link, useParams } from "react-router-dom";
import { localDb } from "../db/localDb";
import { createTransaction, deleteTransaction } from "../sync/mutations";
import { formatRupees, toPaise } from "../utils/money";
import { FilterBar } from "../components/FilterBar";
import { FilterPeriod, rangeForPeriod } from "../utils/dateFilters";

export function WorkDetailPage() {
  const { workId } = useParams<{ workId: string }>();
  const work = useLiveQuery(() => localDb.works.get(workId!), [workId]);
  const client = useLiveQuery(() => (work ? localDb.clients.get(work.clientId) : undefined), [work]);
  const [period, setPeriod] = useState<FilterPeriod>("all");

  const allTxns = useLiveQuery(
    () => localDb.transactions.filter((t) => t.workId === workId && !t.deletedAt).sortBy("txnDate"),
    [workId]
  );

  const range = rangeForPeriod(period);
  const txns = (allTxns || [])
    .filter((t) => !range || (t.txnDate >= range.from && t.txnDate <= range.to))
    .reverse();

  const totalIn = txns.filter((t) => t.type === "IN").reduce((s, t) => s + t.amountPaise, 0);
  const totalOut = txns.filter((t) => t.type === "OUT").reduce((s, t) => s + t.amountPaise, 0);
  const due = work?.agreedFeePaise != null ? work.agreedFeePaise - totalIn : totalOut - totalIn;

  const [showForm, setShowForm] = useState(false);
  const [type, setType] = useState<"IN" | "OUT">("IN");
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<"cash" | "upi" | "bank" | "cheque">("cash");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    if (!amount || !work) return;
    await createTransaction({
      clientId: work.clientId,
      workId: work.id,
      type,
      amountPaise: toPaise(Number(amount)),
      txnDate: new Date(date).getTime(),
      mode,
      note: note.trim() || undefined,
    });
    setAmount("");
    setNote("");
    setShowForm(false);
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          {client && <Link to={`/clients/${client.id}`} className="back-link">← {client.name}</Link>}
          <h2>{work?.title || "…"}</h2>
        </div>
        <button onClick={() => setShowForm((s) => !s)}>{showForm ? "Cancel" : "+ Add transaction"}</button>
      </div>

      <div className="summary-cards">
        <div className="card">
          <span className="muted">Received (IN)</span>
          <strong className="in">{formatRupees(totalIn)}</strong>
        </div>
        <div className="card">
          <span className="muted">Paid out (OUT)</span>
          <strong className="out">{formatRupees(totalOut)}</strong>
        </div>
        <div className="card">
          <span className="muted">{work?.agreedFeePaise != null ? "Due (of agreed fee)" : "Net balance"}</span>
          <strong className={due > 0 ? "due" : "in"}>{formatRupees(Math.abs(due))}{due > 0 ? "" : due < 0 ? " (advance)" : ""}</strong>
        </div>
      </div>

      {showForm && (
        <form className="inline-form txn-form" onSubmit={onAdd}>
          <select value={type} onChange={(e) => setType(e.target.value as "IN" | "OUT")}>
            <option value="IN">Money IN (received)</option>
            <option value="OUT">Money OUT (expense)</option>
          </select>
          <input type="number" placeholder="Amount ₹" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          <select value={mode} onChange={(e) => setMode(e.target.value as any)}>
            <option value="cash">Cash</option>
            <option value="upi">UPI</option>
            <option value="bank">Bank</option>
            <option value="cheque">Cheque</option>
          </select>
          <input placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
          <button type="submit">Save</button>
        </form>
      )}

      <FilterBar value={period} onChange={setPeriod} />

      <div className="list">
        {txns.length === 0 && <p className="empty">No transactions in this period.</p>}
        {txns.map((t) => (
          <div key={t.id} className="list-row">
            <div>
              <strong className={t.type === "IN" ? "in" : "out"}>
                {t.type === "IN" ? "+" : "-"}
                {formatRupees(t.amountPaise)}
              </strong>
              <span className="muted"> · {new Date(t.txnDate).toLocaleDateString("en-IN")} · {t.mode}</span>
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
    </div>
  );
}
