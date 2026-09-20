# Going live

Two pieces to deploy: the API (`server/`, needs a persistent disk for its SQLite file)
and the PWA (`web/`, static files). Recommended: **Fly.io** for the API (free allowance
includes a persistent volume) and **Cloudflare Pages** for the frontend (free, global CDN,
auto SSL). Render is a fine alternative for the API but its free tier's disk is *not*
persistent — every redeploy wipes your data — so it's only listed as a fallback below.

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

## 2. Frontend on Cloudflare Pages

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

## Notes

- `JWT_SECRET` must be a long random string — never reuse the value from `.env.example`.
- Back up the SQLite file periodically (`fly ssh sftp get /data/legal-ledger.db`) until a
  managed Postgres migration is worth doing (see `PRD.md` §14 for that discussion).
