# Legal Ledger — Offline-First Accounting App for Revenue Lawyers

**Status:** Draft v1.0 (spec derived from raw requirement)
**Owner:** Shabbir Vaghela
**Doc type:** Product Requirements + Technical Architecture

---

## 1. Problem Statement

Revenue lawyers (and similar sole-practice professionals — advocates, tax consultants, revenue/land-record lawyers) need to track money **in and out per client/case ("work")**, know **who owes what (dues)**, and see this sliced by **day/week/month/year**. They work from courts, tehsil offices, and client sites where internet is unreliable. A tool that only works online is unusable in the field — so the app must be **offline-first**: every action (adding a transaction, marking a due as paid) must work instantly with no network, queue itself if the API call fails, and **auto-sync** silently the moment connectivity returns, without the lawyer ever having to "retry" anything manually.

This document turns that raw requirement into a complete, implementable spec.

---

## 2. Goals / Non-Goals

**Goals**
- Full CRUD on clients, work/cases, and transactions (in/out) — usable with zero network.
- Every write is durable locally the instant it's made; nothing is ever lost due to a dropped connection.
- Failed/queued API calls become a visible **Pending Sync** state and retry automatically (no user action needed).
- Rich due/receivable tracking per client and per case.
- Date-based filtering: Daily / Weekly / Monthly / Yearly / Custom range / Financial Year (Apr–Mar, since this is India-context).
- Single practitioner first (v1), multi-user firm mode later (v2).

**Non-Goals (v1)**
- Multi-tenant SaaS billing.
- Real-time multi-user concurrent editing on the same case (v1 assumes one lawyer, few clerks — last-write-wins is fine).
- Court-filing / document management integration (separate product surface, not in this spec).

---

## 3. Personas

| Persona | Need |
|---|---|
| **Solo revenue lawyer** | Record fee received/expense paid per client, on the move, offline. See who still owes money. |
| **Office clerk/assistant** | Enter transactions on a shared desktop when the lawyer dictates; syncs to the lawyer's phone. |
| **Accountant (CA) at year end** | Export monthly/yearly ledger, dues report, P&L for filing. |

---

## 4. Core Features (v1 MVP)

1. **Clients / Matters**
   - Client profile (name, phone, address, GSTIN/PAN optional).
   - One or more "Work" items per client (e.g., "Land mutation case", "Revenue appeal #123") — each Work has its own running balance.
2. **Transactions**
   - Type: `IN` (fee/advance received) or `OUT` (expense paid on client's behalf, e.g. court fee, travel).
   - Fields: amount, date, mode (cash/UPI/bank/cheque), note, attachment (photo of receipt, stored as blob, synced later).
   - Every transaction linked to a Client + Work.
3. **Dues / Receivables**
   - Auto-computed: `Due = Total agreed fee (if set) − Total IN` per Work, or simply running balance if no fixed fee.
   - Due list view: sorted by oldest/largest outstanding.
   - Mark-as-settled action.
4. **Reports & Filters**
   - Filter axis: Client, Work, Transaction type, Payment mode.
   - Date axis: Today, This Week, This Month, This Year, Financial Year, Custom range.
   - Views: Ledger (chronological), Summary (totals per period), Dues report, Cash-in-hand vs Bank split.
   - Export: CSV/PDF (generated locally so it also works offline; upload/share when online).
5. **Sync Status & Offline UX**
   - Global sync indicator: `Synced` / `Syncing…` / `N pending` / `Sync error (tap to see)`.
   - Per-record badge (small dot) on any row not yet confirmed by the server.
   - Manual "Sync now" button as an escape hatch, but sync must otherwise be fully automatic.
6. **Auth**
   - Simple email/phone + PIN login; session token cached so app opens offline too (no forced re-login when offline).

---

## 5. Architecture Overview

```
┌─────────────────────────── Client (PWA) ───────────────────────────┐
│                                                                     │
│  UI (React/Next.js)                                                │
│     │  reads/writes ONLY to local store — never calls API directly │
│     ▼                                                               │
│  Local Store (IndexedDB via Dexie/RxDB) ── source of truth on-device│
│     │            ▲                                                  │
│     │            │ applies remote changes                           │
│     ▼            │                                                  │
│  Outbox Queue (persisted table: pending_ops)                        │
│     │                                                               │
│     ▼                                                               │
│  Sync Engine  ── background service worker + in-app scheduler       │
│     - watches navigator.onLine / online / offline events            │
│     - drains outbox with retry + exponential backoff                │
│     - pulls server deltas since last cursor                         │
│     - resolves conflicts (LWW + version field)                      │
│                                                                     │
└──────────────────────────────┬──────────────────────────────────────┘
                                │ HTTPS (only when reachable)
                                ▼
┌─────────────────────────── Backend API ─────────────────────────────┐
│  Sync endpoints (push/pull, batched, idempotent)                    │
│  Domain endpoints (clients, works, transactions) — thin, sync-driven│
│  Auth service (JWT + refresh)                                       │
│  Postgres (source of truth on server)                               │
│  Object storage (receipt photos)                                    │
└───────────────────────────────────────────────────────────────────┘
```

**Core principle: UI never talks to the network directly.** Every read comes from IndexedDB; every write goes to IndexedDB + an outbox entry. The Sync Engine is the *only* thing that talks to the API. This is what makes "API fails → auto pending → auto sync" fall out naturally instead of being bolted on.

---

## 6. Offline-First Data Flow (the "auto pending / auto sync" mechanism)

### 6.1 Write path
1. User taps "Add transaction". UI writes the record directly into IndexedDB with:
   - `id`: client-generated UUID (so it works with zero network, ever).
   - `syncStatus`: `pending`
   - `updatedAt`, `version: 1`
2. An entry is appended to the `outbox` table: `{ opId, entity: 'transaction', entityId, payload, createdAt, attempts: 0 }`.
3. UI updates instantly from the local write (optimistic — no spinner, no "waiting for server").
4. Sync Engine is notified (event emitter) that the outbox is non-empty.

### 6.2 Sync attempt
1. Sync Engine checks connectivity (`navigator.onLine` **and** an actual lightweight `HEAD /health` ping — `onLine` alone is unreliable).
2. If online: POST the outbox batch to `/sync/push` (batched, not one call per record).
3. On success: mark those records `syncStatus: synced`, remove from outbox, store server-confirmed `version`.
4. On failure:
   - **Network error / timeout** → leave in outbox untouched, mark record `syncStatus: pending`, schedule retry with exponential backoff (5s, 15s, 30s, 60s, capped at 5min) + jitter.
   - **Server 4xx (validation)** → mark `syncStatus: error`, surface to user (rare case — genuinely bad data), keep in outbox for manual fix, don't retry blindly forever.
   - **Server 5xx** → treat like network error, retry with backoff.
5. This retry loop is driven by:
   - `online` browser event (retry immediately on reconnect),
   - a periodic timer (every 30–60s while app is open, as backstop),
   - **Background Sync API** (`registration.sync.register('outbox-sync')`) via Service Worker, so sync can fire even if the tab isn't focused, on browsers that support it (Chrome/Android). Fallback: Periodic sync attempt on app foreground for iOS Safari (no Background Sync support there).

### 6.3 Pull path (server → client)
1. Sync Engine periodically (and right after a successful push) calls `/sync/pull?since=<cursor>`.
2. Server returns all rows changed since that cursor (per-table, tenant-scoped).
3. Client applies them into IndexedDB using conflict rule below, advances local cursor.

### 6.4 Conflict resolution
- Every row has `version` (monotonic int) + `updatedAt` + `updatedBy` (device/user id).
- Default: **Last-Write-Wins by `updatedAt`**, but only after checking `version` — if the client's base `version` doesn't match server's current version, it's a real conflict, not just a normal sync lag.
- Financial transactions are **never silently merged**: if a genuine conflict is detected (same record edited on two devices while both offline), the app keeps both as separate ledger entries and flags one for the lawyer to review, rather than guessing which amount is "right." (Money data: never lose a version, never auto-discard.)
- Deletes are soft-deletes (`deletedAt`) so a delete replicated late doesn't resurrect data unexpectedly.

### 6.5 Idempotency
- Every outbox op carries a client-generated `opId` (UUID). Server `/sync/push` dedupes by `opId` so a retried request (e.g., request succeeded but response was lost) never double-applies.

---

## 7. Data Model (simplified)

```
User            { id, name, phone, pinHash, role }
Client          { id, name, phone, address, gstin?, createdAt, updatedAt, version, deletedAt? }
Work            { id, clientId, title, agreedFee?, status(open/closed), createdAt, updatedAt, version, deletedAt? }
Transaction     { id, workId, clientId, type(IN/OUT), amount, date, mode, note,
                  attachmentId?, createdBy, createdAt, updatedAt, version,
                  syncStatus(pending/synced/error), deletedAt? }
Attachment      { id, transactionId, localBlobRef, remoteUrl?, uploadStatus }
SyncCursor      { userId, lastPulledAt, lastServerCursor }
OutboxOp        { opId, entity, entityId, op(create/update/delete), payload, attempts, lastError, createdAt }
```

Local DB (IndexedDB) mirrors all of the above except `OutboxOp`, which is local-only.

---

## 8. API Design

Keep domain endpoints thin; the sync endpoints are what actually matter offline.

```
POST /auth/login              -> { token, refreshToken }
POST /auth/refresh

POST /sync/push                # body: { ops: [ {opId, entity, entityId, op, payload, baseVersion} ] }
                                # returns per-op result: applied | conflict | rejected(reason)

GET  /sync/pull?since=<cursor> # returns { changes: {clients:[...], works:[...], transactions:[...]}, cursor }

GET  /reports/ledger?from&to&clientId&workId&type&mode      # optional server-side reporting for large exports
GET  /reports/dues?asOf
POST /attachments/upload       # multipart, resumable-friendly, called lazily when online
```

All endpoints: JWT bearer auth, tenant/user scoped, rate-limited, and every mutating call requires `opId` for idempotency even outside the batch sync path.

---

## 9. Filters & Reporting Spec

| Filter | Options |
|---|---|
| Period | Today, Yesterday, This Week, Last Week, This Month, Last Month, This Quarter, This Year (calendar), This Financial Year (Apr–Mar), Custom range |
| Entity | All / specific Client / specific Work |
| Type | IN only / OUT only / Both |
| Mode | Cash / UPI / Bank / Cheque / All |
| Status | Settled / Due / All |

Every report view = (period × entity × type × mode × status) applied as a pure client-side query over IndexedDB (works fully offline); large historical exports can optionally hit `/reports/*` when online for heavier aggregation, but nothing in the UI *requires* the network.

Reports needed: Daily cash book, Monthly P&L (IN − OUT), Yearly summary, Client-wise dues aging (0–30/30–60/60+ days), Work-wise ledger.

---

## 10. Tech Stack Recommendation

| Layer | Choice | Why |
|---|---|---|
| Frontend | React + Next.js (or Vite + React), installable **PWA** | Manifest + Service Worker gives installable, offline-capable app on Android/desktop with one codebase |
| Local DB | **Dexie.js** (IndexedDB wrapper) or RxDB if reactive queries/replication plugin is wanted out of the box | RxDB has a built-in replication protocol that matches §6 almost exactly, if you want less hand-rolled sync code |
| Service Worker | Workbox | Battle-tested caching + Background Sync helpers |
| State/UI sync | React Query or plain hooks over Dexie's live queries | Live queries auto-refresh UI when local DB changes (from sync engine too) |
| Backend | Node.js + NestJS (or Express) | Clear module boundaries for auth/sync/reports |
| DB (server) | PostgreSQL | Strong transactional guarantees, good JSON support for flexible payloads |
| Object storage | S3-compatible (or Cloudflare R2) | Receipt photo attachments |
| Auth | JWT + refresh tokens, PIN unlock locally for offline app-open | |
| Hosting | Backend on Fly.io/Render/Railway; frontend as static PWA on Cloudflare Pages/Vercel | Cheap, simple ops for a single-practice app |
| Mobile wrapper (optional, v2) | Capacitor around the same PWA | Real app-store presence without a second codebase |

---

## 11. Non-Functional Requirements

- **Offline duration**: app must remain fully usable (read + write) indefinitely offline; only constrained by device storage.
- **Storage budget**: warn user if IndexedDB usage nears browser quota; attachments compressed before local save.
- **Security**: PIN/biometric app-lock (device may be shared with clerk); data encrypted at rest server-side; TLS in transit; local IndexedDB is only as safe as the device — document this as a known tradeoff, offer app-lock as mitigation.
- **Data integrity**: money fields stored as integer paise/cents, never floats.
- **Performance**: local queries <100ms for ledgers up to ~50k transactions (IndexedDB + proper indexes on `workId`, `date`).
- **Resilience**: killing/reopening the app mid-sync must not duplicate or lose ops (outbox is the recovery log).
- **Observability**: sync error log visible in-app ("3 items failed to sync — tap to view/fix") — never a silent failure.

---

## 12. Sync Status State Machine (per record)

```
draft(local only) --write--> pending --(push ok)--> synced
                                 │
                                 ├--(network fail)--> pending (retry, backoff)
                                 └--(server reject)--> error --user fixes--> pending
```

---

## 13. Phased Roadmap

**Phase 1 — MVP (offline core)**
Local-first CRUD for Clients/Work/Transactions, outbox + auto-sync engine, basic filters (day/week/month/year), sync status UI, PIN login.

**Phase 2 — Reporting & Dues**
Dues aging report, CSV/PDF export, attachment (receipt photo) capture + lazy upload, financial-year filter.

**Phase 3 — Multi-device / small team**
Multiple users per "firm," per-user activity trail, conflict review UI, role permissions (clerk vs lawyer).

**Phase 4 — Polish**
Capacitor mobile app packaging, backup/restore, WhatsApp-share of ledger PDF, recurring/retainer clients.

---

## 14. Open Decisions (need your call before build starts)

1. Hand-roll the outbox/sync engine (full control, more code) vs. adopt **RxDB's replication protocol** (faster to build, less flexibility)?
2. Single-user MVP now, or build the multi-user/firm data model from day one (cheaper to do now than retrofit)?
3. PDF/CSV export: client-side only (works offline, simpler) or also server-generated (better for very large ranges)?

---

*This spec supersedes the original one-line requirement. Next step: confirm §14, then break Phase 1 into engineering tickets.*
