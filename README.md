Sonesoebid Server – Render Deployment

Prereqs
- Node.js 18+
- A PostgreSQL database (Neon or Supabase recommended)

Environment Variables
- DATABASE_URL: Postgres connection string
- JWT_SECRET: strong random secret

Render Setup
1) Create Web Service on Render and point Root Directory to `sonesoebid_server`.
2) Build Command: `npm ci && npx prisma generate`
3) Start Command: `node src/index.js`
4) Health Check Path: `/health`
5) Set Env Vars: `DATABASE_URL`, `JWT_SECRET`.
6) After first deploy, open Shell and run: `npx prisma migrate deploy`.

Notes
- WebSockets (Socket.IO) are supported on Render.
- The app listens on `process.env.PORT` automatically.

