import { FormEvent, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Link } from "react-router-dom";
import { localDb } from "../db/localDb";
import { createClient } from "../sync/mutations";

const OFFICE_LEDGER_NAME = "Office / Firm Expenses";

export function DashboardPage() {
  const clients = useLiveQuery(async () => {
    const rows = await localDb.clients.filter((c) => !c.deletedAt).sortBy("name");
    return rows.sort((a, b) =>
      a.name === OFFICE_LEDGER_NAME ? -1 : b.name === OFFICE_LEDGER_NAME ? 1 : 0
    );
  }, []);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await createClient({ name: name.trim(), phone: phone.trim() || undefined });
    setName("");
    setPhone("");
    setShowForm(false);
  }

  return (
    <div className="page">
      <div className="page-header">
        <h2>Clients</h2>
        <button onClick={() => setShowForm((s) => !s)}>{showForm ? "Cancel" : "+ Add client"}</button>
      </div>

      {showForm && (
        <form className="inline-form" onSubmit={onAdd}>
          <input placeholder="Client name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
          <input placeholder="Phone (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <button type="submit">Save</button>
        </form>
      )}

      <div className="list">
        {clients?.length === 0 && <p className="empty">No clients yet — add your first one above.</p>}
        {clients?.map((c) => (
          <Link key={c.id} to={`/clients/${c.id}`} className="list-row">
            <div>
              <strong>{c.name}</strong>
              {c.phone && <span className="muted"> · {c.phone}</span>}
            </div>
            {c.syncStatus === "pending" && <span className="dot-pending" title="Not synced yet" />}
          </Link>
        ))}
      </div>
    </div>
  );
}
