import { FormEvent, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Link, useParams } from "react-router-dom";
import { localDb } from "../db/localDb";
import { createWork } from "../sync/mutations";
import { formatRupees, toPaise } from "../utils/money";

export function ClientDetailPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const client = useLiveQuery(() => localDb.clients.get(clientId!), [clientId]);
  const works = useLiveQuery(
    () => localDb.works.filter((w) => w.clientId === clientId && !w.deletedAt).sortBy("createdAt"),
    [clientId]
  );
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [fee, setFee] = useState("");

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || !clientId) return;
    await createWork({
      clientId,
      title: title.trim(),
      agreedFeePaise: fee ? toPaise(Number(fee)) : null,
    });
    setTitle("");
    setFee("");
    setShowForm(false);
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <Link to="/" className="back-link">← Clients</Link>
          <h2>{client?.name || "…"}</h2>
        </div>
        <button onClick={() => setShowForm((s) => !s)}>{showForm ? "Cancel" : "+ Add work"}</button>
      </div>

      {showForm && (
        <form className="inline-form" onSubmit={onAdd}>
          <input placeholder="Work / case title" value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus />
          <input
            placeholder="Agreed fee ₹ (optional)"
            type="number"
            value={fee}
            onChange={(e) => setFee(e.target.value)}
          />
          <button type="submit">Save</button>
        </form>
      )}

      <div className="list">
        {works?.length === 0 && <p className="empty">No work items yet for this client.</p>}
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
