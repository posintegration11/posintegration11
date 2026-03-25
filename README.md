# Restaurant POS

Monorepo: **Next.js** web app (`apps/web`), **Express** API with **Socket.IO** (`apps/api`), **PostgreSQL** + **Prisma** (`prisma/`).

## Prerequisites

- Node.js 20+
- npm
- Docker (optional, for local Postgres), **or** a [Supabase](https://supabase.com) project (hosted Postgres)

## Setup

1. **Database** — choose one:

   **A. Local Postgres** (Docker):

   ```bash
   docker compose up -d
   ```

   Then set `DATABASE_URL` to:

   `postgresql://postgres:postgres@localhost:5432/restaurant_pos?schema=public`

   **B. Supabase** (recommended if you do not want local Postgres):

   1. Create a project at [supabase.com](https://supabase.com).
   2. Open **Project Settings → Database** (or **Connect**).
   3. Copy a **Session pooler** URI (**Connection pooling** → **Session**, port `5432`, host `*.pooler.supabase.com`). Direct `db.*.supabase.co` is often **IPv6-only**; many Windows networks fail with Prisma `P1001` unless you use the pooler or fix IPv6.
   4. Set it as `DATABASE_URL` in your root `.env`. Append `?schema=public&sslmode=require` (or `&…` if the URI already has `?`).
   5. Do **not** use **Transaction** pooler (port `6543` / `pgbouncer=true`) for this API — Prisma interactive transactions require **Session** pooler.

   The app does **not** use the Supabase client SDK for auth; it only uses Supabase as **PostgreSQL**. JWT auth stays in the Express API.

   **POS tables on Supabase:** The repo includes `prisma/migrations/20260325120000_restaurant_pos_init/migration.sql`. If you already applied that schema (e.g. via Supabase MCP or SQL editor), mark it applied for Prisma so `migrate deploy` does not try to create tables twice:

   ```bash
   npx prisma migrate resolve --applied 20260325120000_restaurant_pos_init
   ```

   **Note:** Table `public.users` is **POS staff** (email + password hash for this app), not `auth.users` (Supabase Auth). Your existing `public.profiles` / other tables are unchanged.

2. Copy environment file and adjust:

   ```bash
   copy .env.example .env
   ```

3. Install dependencies and prepare the database:

   ```bash
   npm run install:all
   npm run db:push
   npm run db:seed
   ```

   (`install:all` installs root + `apps/api` + `apps/web` and runs `db:generate`.)

   **Supabase:** If the migration was already applied (see above), run `npx prisma migrate resolve --applied 20260325120000_restaurant_pos_init` if you use Prisma Migrate; otherwise `db:push` is enough for dev.

   For local Postgres you can use `npm run db:migrate` instead of `db:push` when you want migration history.

4. Run API and web together:

   ```bash
   npm run dev
   ```

- API: [http://localhost:4000](http://localhost:4000) — health check at `/health`
- Web: [http://localhost:3000](http://localhost:3000)

## Seeded logins

All seeded users use password **`password123`**:

| Email               | Role    |
| ------------------- | ------- |
| admin@pos.local     | ADMIN   |
| cashier@pos.local   | CASHIER |
| waiter@pos.local    | WAITER  |
| kitchen@pos.local   | KITCHEN |

## Typical flow

1. **Waiter / cashier**: **Tables** → open a table → add items → **Send to kitchen**.
2. **Kitchen**: **Kitchen** screen → update KOT / line status (realtime refresh via Socket.IO).
3. **Cashier**: **Tables** → **Ready for billing** (from order screen) → **Billing** → recalculate if needed → **Generate invoice** → **Record payment** → table returns to free.

## Walk-in (counter) orders

The seed creates a virtual **Walk-in** table (`table_number` **0**, `is_walk_in` on `restaurant_tables`). Use **New walk-in order** on the Tables screen to always create a **new** order and open it with `?orderId=`; multiple walk-in orders can be open at once. The walk-in row stays **FREE** — only real dine-in tables are set to **OCCUPIED** when you start an order.

After connecting with **Supabase Session pooler**, run `npx prisma migrate deploy` (or `db:push`) and `npm run db:seed` so the Walk-in table exists.

## Deploy on Render

Repo includes [`render.yaml`](./render.yaml) (API + Next web as two **Web Services**). PostgreSQL is **not** created by this file — use [Supabase](https://supabase.com) (Session pooler `DATABASE_URL`) or create a [Render Postgres](https://render.com/docs/databases) instance and set `DATABASE_URL` on **`pos-api`**.

1. **Dashboard:** [Render](https://dashboard.render.com) → **New** → **Blueprint** → connect [your GitHub repo](https://github.com/posintegration11/posintegration11). Render will prompt for secret env vars (`DATABASE_URL`, `CORS_ORIGIN`, `NEXT_PUBLIC_*`).
2. **Order:** Deploy **`pos-api` first**. When it is live, copy its URL (e.g. `https://pos-api-xxxx.onrender.com`). Open **Environment** on **`pos-web`** and set `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_SOCKET_URL` to that **same base URL** (no trailing slash). Set **`pos-api`** → `CORS_ORIGIN` to your **`pos-web`** URL (e.g. `https://pos-web-xxxx.onrender.com`).
3. **Redeploy `pos-web`** so Next.js bakes in the public env vars. Hit `/health` on the API and open the web URL in a browser.
4. **Free tier:** services **spin down** when idle — first request can be slow. **Database seed:** run locally with prod `DATABASE_URL` or add a one-off shell on Render: `npx prisma db seed` from repo root (requires `tsx` / dev deps — easiest is seed from your PC against prod DB once).

`JWT_SECRET` is auto-generated by the blueprint if you use it as-is.

**Manual Web Service (API):** If you create the API service in the dashboard instead of the blueprint, mirror `render.yaml`:  
`npm ci --include=dev && npm ci --prefix apps/api --include=dev && npx prisma generate && npm run build --prefix apps/api && npx prisma db push`  
(`migrate deploy` hits **P3005** on many Supabase DBs until you [baseline](https://www.prisma.io/docs/guides/database/developing-with-prisma-migrate/baselining) migrations; **`db push`** syncs the schema on each deploy.)

To use **`migrate deploy`** on Render instead: from your PC, once, with prod `DATABASE_URL`, run `npx prisma migrate resolve --applied <folder_name>` for each migration already applied to the DB (see `prisma/migrations/`), then switch the build command back to `npx prisma migrate deploy`.

## Scripts

| Script            | Description                |
| ----------------- | -------------------------- |
| `npm run dev`     | API + web in parallel      |
| `npm run dev:api` | API only                   |
| `npm run dev:web` | Web only                   |
| `npm run db:generate` | Prisma client          |
| `npm run db:migrate`  | Create/apply migrations |
| `npm run db:push`     | Push schema (no migration files) |
| `npm run db:seed`     | Seed tables, menu, users |

## Project layout

- `apps/api` — REST under `/api/v1`, JWT auth, role checks, Socket.IO on the same HTTP server.
- `apps/web` — App Router UI; token stored in `localStorage` for API calls.
- `prisma/schema.prisma` — database schema and enums.
