# Legal Ledger

Offline-first accounts & dues tracker for revenue lawyers. Full spec in [`PRD.md`](./PRD.md).

Every write happens instantly against a local IndexedDB store. If the API is unreachable, the
write is queued in an on-device outbox and marked **pending** — the app never blocks on the
network. The moment connectivity returns, the sync engine drains the outbox automatically
(retry with exponential backoff, idempotent ops, no user action required) and pulls down any
server-side changes.

This has been built and verified end-to-end in a real browser: add data offline → see it marked
pending → reconnect → watch it auto-sync to "Synced" with no manual retry.

## Structure

- `server/` — Node + Express + TypeScript API (SQLite), JWT auth, `/sync/push` `/sync/pull`, reports
- `web/` — Vite + React + TypeScript installable PWA, Dexie (IndexedDB) local store + sync engine

## Running locally

```bash
# Backend
cd server
cp .env.example .env   # edit JWT_SECRET before any real use
npm install
npm run build && npm start   # or: npm run dev

# Frontend (separate terminal)
cd web
cp .env.example .env   # point VITE_API_BASE at your backend
npm install
npm run dev
```

Open http://localhost:5173, create an account, then try switching your browser/devtools to
offline — the app keeps working, and syncs automatically once you're back online.

## Deploying

- **Backend**: any Node host that can run a long-lived process with a writable disk for the
  SQLite file (Fly.io, Render, Railway). Set `JWT_SECRET`, `CORS_ORIGIN` (your frontend's URL),
  and optionally `DB_PATH` to a persistent volume path.
- **Frontend**: static hosting for the Vite build output (Cloudflare Pages, Vercel, Netlify).
  Set `VITE_API_BASE` to your deployed backend's URL at build time.

See `PRD.md` §14 for open architecture decisions before scaling past a single practitioner.
