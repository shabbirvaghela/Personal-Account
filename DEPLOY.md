# Going live

The backend now runs on Postgres (via `pg`) instead of a local SQLite file, so it has no
local state to lose — which means it can run as a Vercel serverless function, and both
halves of the app (`server/` and `web/`) can live on Vercel, with **Supabase** providing the
free Postgres database. Everything below is free.

## 0. Database is already set up

A Supabase project called **"Personal account"** already exists in your account (created
today) and its schema (users/clients/works/transactions tables) has already been applied to
it directly — nothing to do there. You only need its connection string:

1. Open [supabase.com/dashboard/project/cswbcfdiffbjfqrksegx/settings/database](https://supabase.com/dashboard/project/cswbcfdiffbjfqrksegx/settings/database)
2. Under **Connection string**, choose the **Transaction pooler** tab (port 6543 — this is
   the one safe for serverless, since it doesn't hold a dedicated Postgres connection open
   per request the way a direct connection would).
3. Copy it — it looks like
   `postgresql://postgres.cswbcfdiffbjfqrksegx:[YOUR-PASSWORD]@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres`
4. Replace `[YOUR-PASSWORD]` with your database password. If you don't remember it, this same
   page has a **Reset database password** button.

That full string is your `DATABASE_URL` for every step below.

## 1. Test locally first

```bash
cd server
cp .env.example .env
# edit .env: set DATABASE_URL to the string from step 0, and JWT_SECRET to any random string
npm install && npm run build && npm start
```

```bash
cd web
cp .env.example .env
# edit .env: VITE_API_BASE=http://localhost:4000
npm install && npm run dev
```

Open `http://localhost:5173`, create an account, add a client/transaction — this is now
writing to your real Supabase project, so it's a genuine end-to-end test before deploying
anywhere.

## 2. Backend on Vercel

```bash
cd server
npx vercel login          # opens browser, free account
npx vercel                # first run: link/create a project — it auto-detects
                           # vercel.json + api/index.ts, no build config needed
npx vercel env add DATABASE_URL production
                           # paste the connection string from step 0
npx vercel env add JWT_SECRET production
                           # paste: openssl rand -hex 32
npx vercel --prod
```

Vercel prints your API URL (`https://<project>.vercel.app`). Verify:

```bash
curl https://<your-api-project>.vercel.app/health
```

## 3. Frontend on Vercel

```bash
cd web
npx vercel login
npx vercel
npx vercel env add VITE_API_BASE production
                           # paste the backend URL from step 2
npx vercel --prod          # rebuild — Vite env vars are baked in at build time
```

This prints your live app URL — open it on your phone, anywhere, not just your WiFi.

## 4. Connect them

Point the backend's CORS at the frontend, then redeploy so it takes effect:

```bash
cd server
npx vercel env add CORS_ORIGIN production
                           # paste: https://<your-frontend-project>.vercel.app
npx vercel --prod
```

## 5. Try it live

Open the frontend URL, create an account, add a client/transaction, then toggle your
phone/laptop to airplane mode and keep using the app — it keeps working. Reconnect and watch
the sync badge in the top bar go from "N pending" to "Synced" with no action from you.

## Alternative: Fly.io for the backend

If you'd rather run the backend as a normal long-running server instead of serverless
functions (e.g. to avoid Vercel's per-invocation timeout on very large sync batches), the
same Postgres-backed code works there unchanged — `Dockerfile` and `fly.toml` are still in
`server/`, just set `DATABASE_URL` the same way instead of a volume:

```bash
cd server
fly launch --no-deploy
fly secrets set DATABASE_URL="<connection string from step 0>" JWT_SECRET="$(openssl rand -hex 32)"
fly deploy
```

## Enabling "Sign in with Google"

The button stays hidden until you configure this — email/password keeps working either way.

1. Go to [console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials)
   (create a project first if you don't have one).
2. **Create credentials** → **OAuth client ID** → Application type **Web application**.
3. Under **Authorized JavaScript origins**, add every URL you'll open the app from, e.g.:
   - `http://localhost:5173` (local dev)
   - `https://<your-frontend-project>.vercel.app` (once deployed)
4. Copy the **Client ID** and set it in both places, then redeploy each:
   - `web`: `npx vercel env add VITE_GOOGLE_CLIENT_ID production`, then `npx vercel --prod`
   - `server`: `npx vercel env add GOOGLE_CLIENT_ID production`, then `npx vercel --prod`

## Notes

- `JWT_SECRET` must be a long random string — never reuse the value from `.env.example`.
- The Supabase free tier pauses a project after a week of no API activity; the first request
  after a pause takes a few extra seconds to wake it back up, which is otherwise invisible.
- See `PRD.md` §14 for the multi-user/firm data model discussion, which becomes more relevant
  now that the database is a real shared Postgres instance rather than a per-device file.
