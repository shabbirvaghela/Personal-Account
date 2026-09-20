import { useEffect, useState } from "react";
import { syncEngine, SyncState } from "../sync/syncEngine";

export function SyncStatusBadge() {
  const [state, setState] = useState<{ status: SyncState; pendingCount: number; lastError?: string }>({
    status: "idle",
    pendingCount: 0,
  });

  useEffect(() => syncEngine.subscribe(setState), []);

  let label = "Synced";
  let color = "#22c55e";
  if (state.status === "offline") {
    label = state.pendingCount > 0 ? `Offline · ${state.pendingCount} pending` : "Offline";
    color = "#64748b";
  } else if (state.status === "syncing") {
    label = "Syncing…";
    color = "#eab308";
  } else if (state.status === "error") {
    label = `Sync error · ${state.pendingCount} pending`;
    color = "#ef4444";
  } else if (state.pendingCount > 0) {
    label = `${state.pendingCount} pending`;
    color = "#eab308";
  }

  return (
    <div className="sync-badge" title={state.lastError} style={{ borderColor: color }}>
      <span className="dot" style={{ background: color }} />
      {label}
    </div>
  );
}
