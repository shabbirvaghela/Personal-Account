import { localDb, getMeta, setMeta, Entity } from "../db/localDb";
import { api, ApiError } from "../api/client";

export type SyncState = "idle" | "syncing" | "offline" | "error";

interface SyncListener {
  (state: { status: SyncState; pendingCount: number; lastError?: string; lastSyncedAt?: number }): void;
}

const TABLE_FOR: Record<Entity, "clients" | "works" | "transactions"> = {
  client: "clients",
  work: "works",
  transaction: "transactions",
};

class SyncEngine {
  private listeners = new Set<SyncListener>();
  private status: SyncState = "idle";
  private lastError?: string;
  private lastSyncedAt?: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private backoffMs = 5000;
  private readonly MAX_BACKOFF = 5 * 60 * 1000;
  private running = false;
  private started = false;
  private readonly onlineHandler = () => this.kick();
  private readonly offlineHandler = () => this.emit();

  start() {
    if (this.started) return;
    this.started = true;
    window.addEventListener("online", this.onlineHandler);
    window.addEventListener("offline", this.offlineHandler);
    this.timer = setInterval(() => this.kick(), 30_000);
    this.kick();
  }

  stop() {
    if (!this.started) return;
    this.started = false;
    window.removeEventListener("online", this.onlineHandler);
    window.removeEventListener("offline", this.offlineHandler);
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  subscribe(listener: SyncListener): () => void {
    this.listeners.add(listener);
    this.emit();
    return () => this.listeners.delete(listener);
  }

  async kick() {
    if (this.running) return;
    this.running = true;
    try {
      if (!navigator.onLine) {
        this.status = "offline";
        this.emit();
        return;
      }
      await this.drainOutbox();
      await this.pull();
      this.status = "idle";
      this.lastError = undefined;
      this.lastSyncedAt = Date.now();
      this.backoffMs = 5000;
    } catch (err) {
      this.status = "error";
      this.lastError = err instanceof Error ? err.message : String(err);
      this.scheduleRetry();
    } finally {
      this.running = false;
      this.emit();
    }
  }

  private scheduleRetry() {
    const delay = this.backoffMs + Math.random() * 1000;
    this.backoffMs = Math.min(this.backoffMs * 2, this.MAX_BACKOFF);
    setTimeout(() => this.kick(), delay);
  }

  private async drainOutbox() {
    const ops = await localDb.outbox.orderBy("createdAt").toArray();
    if (ops.length === 0) return;

    const batch = ops.slice(0, 50).map((o) => ({
      opId: o.opId,
      entity: o.entity,
      entityId: o.entityId,
      op: o.op,
      baseVersion: o.baseVersion,
      payload: o.payload,
    }));

    let res;
    try {
      res = await api.push(batch);
    } catch (err) {
      if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
        // bad request shape; do not spin forever, but keep for visibility
        throw err;
      }
      throw err; // network / 5xx -> caller schedules backoff, outbox untouched
    }

    for (const op of batch) {
      const result = res.results[op.opId];
      if (!result) continue;
      const table = localDb[TABLE_FOR[op.entity]];

      if (result.status === "applied") {
        await localDb.outbox.delete(op.opId);
        const existing = await (table as any).get(op.entityId);
        if (existing) {
          await (table as any).update(op.entityId, {
            syncStatus: "synced",
            version: result.version ?? existing.version,
          });
        }
      } else if (result.status === "conflict") {
        // server has a newer version than we based our edit on: pull will
        // bring the authoritative row down; keep our op queued as a fresh
        // edit on top of it, rebasing baseVersion.
        await localDb.outbox.update(op.opId, { baseVersion: result.version });
      } else if (result.status === "rejected") {
        await localDb.outbox.delete(op.opId);
        const existing = await (table as any).get(op.entityId);
        if (existing) {
          await (table as any).update(op.entityId, { syncStatus: "error" });
        }
      }
    }
  }

  private async pull() {
    const since = Number((await getMeta("syncCursor")) ?? 0);
    const { changes, cursor } = await api.pull(since);

    await localDb.transaction("rw", localDb.clients, localDb.works, localDb.transactions, async () => {
      for (const c of changes.clients) await this.applyRemote(localDb.clients, c);
      for (const w of changes.works) await this.applyRemote(localDb.works, w);
      for (const t of changes.transactions) await this.applyRemote(localDb.transactions, t);
    });

    await setMeta("syncCursor", cursor);
  }

  private async applyRemote(table: any, remoteSnake: Record<string, any>) {
    const local = camelizeRow(remoteSnake);
    const existing = await table.get(local.id);
    // Local wins only if it has unsynced pending edits newer than this remote version.
    if (existing && existing.syncStatus === "pending" && existing.version >= local.version) {
      return;
    }
    await table.put({ ...local, syncStatus: "synced" });
  }

  private emit() {
    const status = this.status;
    localDb.outbox.count().then((pendingCount) => {
      for (const l of this.listeners) {
        l({ status, pendingCount, lastError: this.lastError, lastSyncedAt: this.lastSyncedAt });
      }
    });
  }
}

function camelizeRow(row: Record<string, any>): any {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(row)) {
    const camel = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    out[camel] = v;
  }
  return out;
}

export const syncEngine = new SyncEngine();
