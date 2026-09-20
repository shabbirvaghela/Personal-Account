import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate } from "react-router-dom";
import { localDb } from "../db/localDb";
import { getOfficeAddress, getPetrolRate } from "../settings/settings";
import { calculateDrivingDistanceKm, DistanceError } from "../utils/distance";
import { createTransaction } from "../sync/mutations";
import { formatRupees, toPaise } from "../utils/money";

export function PetrolExpensePage() {
  const navigate = useNavigate();
  const clients = useLiveQuery(() => localDb.clients.filter((c) => !c.deletedAt).sortBy("name"), []);

  const [clientId, setClientId] = useState<string>("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [rate, setRate] = useState(5);
  const [status, setStatus] = useState<"idle" | "calculating" | "ready" | "saving" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [cost, setCost] = useState<number>(0);
  const [resolved, setResolved] = useState<{ from: string; to: string } | null>(null);

  useEffect(() => {
    getOfficeAddress().then(setFrom);
    getPetrolRate().then(setRate);
  }, []);

  useEffect(() => {
    if (!clientId && clients && clients.length > 0) {
      const office = clients.find((c) => c.name === "Office / Firm Expenses");
      setClientId((office || clients[0]).id);
    }
  }, [clients, clientId]);

  async function onCalculate() {
    setError(null);
    setStatus("calculating");
    try {
      const result = await calculateDrivingDistanceKm(from, to);
      setDistanceKm(result.distanceKm);
      setCost(result.distanceKm * rate);
      setResolved({ from: result.fromResolved, to: result.toResolved });
      setStatus("ready");
    } catch (err) {
      setStatus("error");
      if (err instanceof DistanceError) {
        setError(err.message);
      } else if (!navigator.onLine) {
        setError("You're offline — distance lookup needs internet. You can still add this as a manual expense instead.");
      } else {
        setError("Could not calculate distance. Please check the addresses and try again.");
      }
    }
  }

  async function onAddExpense() {
    if (!clientId || distanceKm == null) return;
    setStatus("saving");
    await createTransaction({
      clientId,
      workId: null,
      type: "OUT",
      amountPaise: toPaise(Math.round(cost)),
      txnDate: Date.now(),
      mode: "cash",
      note: `Petrol: ${from} → ${to} (${distanceKm.toFixed(1)} km @ ₹${rate}/km)`,
    });
    navigate(`/clients/${clientId}`);
  }

  return (
    <div className="page">
      <div className="page-header">
        <h2>Petrol expense</h2>
      </div>

      <div className="quick-add">
        <label className="settings-label">Add expense to</label>
        <select className="settings-input" value={clientId} onChange={(e) => setClientId(e.target.value)}>
          {clients?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <label className="settings-label" style={{ marginTop: 12 }}>From</label>
        <input className="settings-input" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="Office address" />

        <label className="settings-label" style={{ marginTop: 12 }}>To</label>
        <input className="settings-input" value={to} onChange={(e) => setTo(e.target.value)} placeholder="e.g. District Court, Surat" />

        <label className="settings-label" style={{ marginTop: 12 }}>Rate per km (₹)</label>
        <input
          className="settings-input"
          type="number"
          step="0.5"
          value={rate}
          onChange={(e) => setRate(Number(e.target.value))}
        />

        <button style={{ marginTop: 14 }} onClick={onCalculate} disabled={status === "calculating" || !from.trim() || !to.trim()}>
          {status === "calculating" ? "Calculating…" : "Calculate distance & cost"}
        </button>

        {error && <p className="error" style={{ marginTop: 10 }}>{error}</p>}

        {status === "ready" && distanceKm != null && (
          <div className="summary-cards" style={{ marginTop: 14 }}>
            <div className="card">
              <span className="muted">Distance</span>
              <strong>{distanceKm.toFixed(1)} km</strong>
            </div>
            <div className="card">
              <span className="muted">Cost (editable)</span>
              <input
                className="settings-input"
                type="number"
                value={cost}
                onChange={(e) => setCost(Number(e.target.value))}
              />
            </div>
          </div>
        )}

        {status === "ready" && resolved && (
          <p className="muted" style={{ marginTop: 6 }}>
            Resolved: {resolved.from} → {resolved.to}
          </p>
        )}

        {status === "ready" && (
          <button style={{ marginTop: 10 }} onClick={onAddExpense} disabled={!clientId}>
            Add expense of {formatRupees(toPaise(cost))}
          </button>
        )}
      </div>
    </div>
  );
}
