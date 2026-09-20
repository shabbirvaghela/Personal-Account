import { useState } from "react";
import { parseQuickEntries, QuickEntry } from "../utils/quickParse";
import { createTransactionsBatch } from "../sync/mutations";
import { formatRupees } from "../utils/money";

interface Props {
  clientId: string;
  workId?: string | null;
  defaultMode?: "cash" | "upi" | "bank" | "cheque";
  onSaved?: () => void;
}

export function QuickAddPanel({ clientId, workId, defaultMode = "cash", onSaved }: Props) {
  const [text, setText] = useState("");
  const [entries, setEntries] = useState<QuickEntry[] | null>(null);
  const [saving, setSaving] = useState(false);

  function parse() {
    if (!text.trim()) return;
    setEntries(parseQuickEntries(text));
  }

  function updateEntry(id: string, patch: Partial<QuickEntry>) {
    setEntries((prev) => prev && prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }

  function removeEntry(id: string) {
    setEntries((prev) => prev && prev.filter((e) => e.id !== id));
  }

  async function saveAll() {
    if (!entries) return;
    const toSave = entries.filter((e) => e.include);
    if (toSave.length === 0) return;
    setSaving(true);
    try {
      await createTransactionsBatch(
        toSave.map((e) => ({
          clientId,
          workId,
          type: e.type,
          amountPaise: e.amountPaise,
          txnDate: Date.now(),
          mode: defaultMode,
          note: e.note || undefined,
        }))
      );
      setText("");
      setEntries(null);
      onSaved?.();
    } finally {
      setSaving(false);
    }
  }

  const includedCount = entries?.filter((e) => e.include).length ?? 0;
  const netTotal = entries
    ? entries.filter((e) => e.include).reduce((s, e) => s + (e.type === "IN" ? e.amountPaise : -e.amountPaise), 0)
    : 0;

  return (
    <div className="quick-add">
      {!entries && (
        <>
          <textarea
            className="quick-add-textarea"
            placeholder={"Type or paste entries, one per line — e.g.\n1790rs light bill received\n-2000rs\n700rs online received"}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) parse();
            }}
          />
          <button onClick={parse} disabled={!text.trim()}>
            Parse entries
          </button>
        </>
      )}

      {entries && (
        <div className="quick-add-preview">
          <p className="muted">
            {entries.length} line{entries.length !== 1 ? "s" : ""} detected — check each one, then save.
          </p>
          <div className="quick-entries">
            {entries.map((e) => (
              <div key={e.id} className={"quick-entry-row" + (e.uncertainType ? " uncertain" : "") + (!e.include ? " excluded" : "")}>
                <input
                  type="checkbox"
                  checked={e.include}
                  onChange={(ev) => updateEntry(e.id, { include: ev.target.checked })}
                  title={e.balanceOnly ? "Detected as a balance note, not a transaction" : "Include this entry"}
                />
                <button
                  type="button"
                  className={"type-pill " + (e.type === "IN" ? "in" : "out")}
                  onClick={() => updateEntry(e.id, { type: e.type === "IN" ? "OUT" : "IN", uncertainType: false })}
                  title="Tap to flip IN/OUT"
                >
                  {e.type === "IN" ? "+ IN" : "− OUT"}
                </button>
                <input
                  className="quick-amount"
                  type="number"
                  value={e.amountPaise / 100}
                  onChange={(ev) => updateEntry(e.id, { amountPaise: Math.round(Number(ev.target.value) * 100) })}
                />
                <input
                  className="quick-note"
                  value={e.note}
                  placeholder="note"
                  onChange={(ev) => updateEntry(e.id, { note: ev.target.value })}
                />
                {e.uncertainType && <span className="dot-pending" title="Guessed IN/OUT — please check" />}
                <button type="button" className="link-btn danger" onClick={() => removeEntry(e.id)}>
                  ✕
                </button>
              </div>
            ))}
          </div>
          <div className="quick-add-actions">
            <button className="link-btn" onClick={() => setEntries(null)}>
              ← Edit text
            </button>
            <span className="muted">
              {includedCount} to save · net {netTotal >= 0 ? "+" : "−"}
              {formatRupees(Math.abs(netTotal))}
            </span>
            <button onClick={saveAll} disabled={saving || includedCount === 0}>
              {saving ? "Saving…" : `Save ${includedCount}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
