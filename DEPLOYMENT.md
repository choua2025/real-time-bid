# Deployment

- **Backend** → Render (Docker web service + managed Postgres), defined in [`render.yaml`](render.yaml).
- **Frontend** → Vercel (Nuxt 3, root dir `frontend/`).
- **Trigger**: the GitHub Actions `deploy` job fires both platforms' **deploy hooks**, but only on push to `main` and only after the `verify` and `frontend-build` jobs pass. A red pipeline never ships.

```
push to main ──▶ verify ─┐
                         ├─▶ deploy ──▶ POST Render hook  (backend build + migrate + start)
              frontend-build ─┘        └─▶ POST Vercel hook  (frontend build + deploy)
```

## One-time setup

### 1. Backend on Render
1. Render Dashboard → **New → Blueprint** → connect this repo. Render reads `render.yaml` and creates the `realtime-bid-api` service + `realtime-bid-db` Postgres.
2. After the service exists, copy its URL (e.g. `https://realtime-bid-api.onrender.com`).
3. Service → **Settings → Deploy Hook** → copy the URL.
4. You'll set `CORS_ORIGIN` in step 3 below (once you have the Vercel URL).

### 2. Frontend on Vercel
1. Vercel → **Add New → Project** → import this repo.
2. **Root Directory** → `frontend`. Vercel auto-detects Nuxt (no build config needed).
3. **Environment Variables** — point at the Render URL from step 1.2:
   - `NUXT_PUBLIC_API_BASE` = `https://realtime-bid-api.onrender.com/api`
   - `NUXT_PUBLIC_SOCKET_URL` = `https://realtime-bid-api.onrender.com`
4. Deploy once so the project gets a URL (e.g. `https://real-time-bid.vercel.app`).
5. **Settings → Git** → turn **off** automatic deployments for the production branch (the pipeline drives deploys, so this avoids double-deploys).
6. **Settings → Deploy Hooks** → create a hook for the `main` branch → copy the URL.

### 3. Finish wiring
1. **Render** → `realtime-bid-api` → **Environment** → set `CORS_ORIGIN` to your exact Vercel URL (no trailing slash, no `*`), e.g. `https://real-time-bid.vercel.app`.
2. **GitHub** → repo **Settings → Secrets and variables → Actions** → add:
   - `RENDER_DEPLOY_HOOK_URL` = the hook from step 1.3
   - `VERCEL_DEPLOY_HOOK_URL` = the hook from step 2.6
3. Push to `main` (or re-run the latest workflow). After CI is green, the `deploy` job triggers both builds.

## Notes
- Render's free Postgres expires after ~90 days and free web services cold-start after idle — fine for a demo, upgrade for production.
- The backend image runs `prisma migrate deploy` on every boot (see [`docker-entrypoint.sh`](docker-entrypoint.sh)), so schema changes apply automatically on deploy.
- `frontend/Dockerfile` is no longer used by CD (Vercel builds Nuxt itself) but is kept for local container use.
