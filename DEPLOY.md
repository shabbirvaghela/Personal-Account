# Going live

## Fastest way to test right now (2 minutes, no accounts)

Claude's sandbox for this session can't expose a public URL (outbound tunnels are blocked
by policy), so I can't hand you a link directly. But you can get one on your own phone in
about 2 minutes, using your laptop and home/office WiFi — no cloud account needed:

```bash
git pull   # get this branch on your laptop
cd server && npm install && cp .env.example .env
# edit .env: set JWT_SECRET to any random string
npm run build && npm start &

cd ../web && npm install && cp .env.example .env
# edit .env: set VITE_API_BASE=http://<your-laptop's-LAN-IP>:4000
npm run dev -- --host
```

Vite will print a "Network:" URL like `http://192.168.x.x:5173` — open that on your phone
while it's on the **same WiFi** as your laptop. This is a real, fully working instance
(same code, same offline/sync behavior) — just not reachable from outside your network, and
it stops when you close the terminal. For something permanent with its own public link, do
the Fly.io + Cloudflare Pages steps below (~10 more commands, one-time).

## Permanent deployment

Two pieces to deploy: the API (`server/`, needs a persistent disk for its SQLite file)
and the PWA (`web/`, static files). Both are free.

**Why not put the whole thing on Vercel?** Vercel's Node hosting is serverless functions —
each request can run on a fresh instance with a wiped filesystem, so a SQLite file written
there doesn't reliably survive between requests. Vercel is genuinely great for the frontend
(static Vite build, free, instant global CDN) — just not for this backend as written. The
fix that keeps it all on Vercel would be swapping SQLite for a hosted Postgres (e.g. free
tier on Neon or Supabase) so the backend has no local file to lose; that's a real option
later, but it's a code change, not just a deploy setting, so it's not in this file yet — say
the word if you want that instead of Fly.io.

Recommended for now: **Fly.io** for the API (free allowance includes a persistent volume)
and **Vercel or Cloudflare Pages** for the frontend (free, global CDN, auto SSL). Render is a
fine alternative for the API but its free tier's disk is *not* persistent — every redeploy
wipes your data — so it's only listed as a fallback below.

## 1. Backend on Fly.io

```bash
# one-time: install & log in
curl -L https://fly.io/install.sh | sh
fly auth login          # opens browser, creates a free account if needed

cd server
fly launch --no-deploy   # detects the Dockerfile, asks for an app name/region
                          # say NO to "would you like a Postgres database" — we use SQLite
```

This generates/updates `fly.toml` (a starter is already committed — just edit the `app`
name, since Fly app names must be globally unique). Then:

```bash
fly volumes create legal_ledger_data --size 1   # 1GB persistent disk for the SQLite file

fly secrets set \
  JWT_SECRET="$(openssl rand -hex 32)" \
  CORS_ORIGIN="https://<your-frontend-domain>"   # fill this in after step 2, or update later

fly deploy
```

Your API is now live at `https://<your-app-name>.fly.dev`. Verify:

```bash
curl https://<your-app-name>.fly.dev/health
```

## 2. Frontend — Vercel (or Cloudflare Pages, either works)

### Option A: Vercel

```bash
cd web
npx vercel login        # opens browser, free account
npx vercel               # first run: link/create project, accept Vite defaults
                          # (build command `npm run build`, output dir `dist`)
npx vercel env add VITE_API_BASE production
                          # paste: https://<your-app-name>.fly.dev
npx vercel --prod         # rebuild so the env var is actually baked in
```

Vercel prints your live URL (`https://<project>.vercel.app`) after the last command — that's
your test link, works on any phone/laptop immediately, not just your WiFi. Then point the
backend's CORS at it:

```bash
fly secrets set CORS_ORIGIN="https://<project>.vercel.app" -a <your-app-name>
```

### Option B: Cloudflare Pages

1. Push this repo to GitHub if it isn't already connected (it is — you're on
   `claude/offline-first-auto-sync-j3xk0e`; merge it into your main branch first, or point
   Pages at this branch directly for a preview).
2. Go to the Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** →
   **Connect to Git** → pick this repo.
3. Build settings:
   - **Root directory**: `web`
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
   - **Environment variable**: `VITE_API_BASE` = `https://<your-app-name>.fly.dev`
4. Deploy. Cloudflare gives you a `https://<project>.pages.dev` URL immediately, and you
   can attach a custom domain for free under the project's **Custom domains** tab.
5. Go back to Fly and update the CORS origin to match:
   ```bash
   fly secrets set CORS_ORIGIN="https://<project>.pages.dev" -a <your-app-name>
   ```

## 3. Try it live

Open the Pages URL, create an account, add a client/transaction, then toggle your
phone/laptop to airplane mode and keep using the app — it keeps working. Reconnect and
watch the sync badge in the top bar go from "N pending" to "Synced" with no action from you.

## Alternative: Render (simpler, but data doesn't persist across redeploys on the free tier)

- New **Web Service** → connect repo → root directory `server` → build command
  `npm install && npm run build` → start command `npm start`.
- Set env vars `JWT_SECRET`, `CORS_ORIGIN`, and leave `DB_PATH` as the default.
- Fine for a demo/trial; upgrade to a paid plan with a persistent disk before storing real
  client data, or switch to Fly.io as above.

## Enabling "Sign in with Google"

The button stays hidden until you configure this — email/password keeps working either way.

1. Go to [console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials)
   (create a project first if you don't have one).
2. **Create credentials** → **OAuth client ID** → Application type **Web application**.
3. Under **Authorized JavaScript origins**, add every URL you'll open the app from, e.g.:
   - `http://localhost:5173` (local dev)
   - `http://<your-laptop-LAN-IP>:5173` (phone testing over WiFi, from the section above)
   - `https://<project>.pages.dev` (once deployed)
4. Copy the **Client ID** it gives you and set it in both places:
   - `web/.env` → `VITE_GOOGLE_CLIENT_ID=<client id>` (also set this as a Cloudflare Pages
     environment variable if deployed there)
   - `server/.env` → `GOOGLE_CLIENT_ID=<client id>` (also `fly secrets set GOOGLE_CLIENT_ID=...`
     if deployed to Fly)
5. Rebuild/redeploy the frontend (env vars are baked in at build time) and restart the backend.

## Notes

- `JWT_SECRET` must be a long random string — never reuse the value from `.env.example`.
- Back up the SQLite file periodically (`fly ssh sftp get /data/legal-ledger.db`) until a
  managed Postgres migration is worth doing (see `PRD.md` §14 for that discussion).
