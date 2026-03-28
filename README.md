# YUGO MAFIA Control

Inventory management starter with:

- Railway-ready Express API
- Railway PostgreSQL via Prisma
- Netlify-ready static frontend in [`Frontend`](/C:/Users/User/Desktop/Website/Frontend)
- Admin and user login
- Page-level permissions
- Inventory, bank, and distribution modules
- Shared theming, toast notifications, skeleton loading, and form-based workflows

## Project structure

- [`backend`](/C:/Users/User/Desktop/Website/backend): Express API, Prisma schema, seed script
- [`Frontend`](/C:/Users/User/Desktop/Website/Frontend): Static HTML pages and shared assets
- [`package.json`](/C:/Users/User/Desktop/Website/package.json): Backend scripts and dependencies
- [`netlify.toml`](/C:/Users/User/Desktop/Website/netlify.toml): Netlify publish config
- [`railway.json`](/C:/Users/User/Desktop/Website/railway.json): Railway start config

## Pages

- [`Frontend/index.html`](/C:/Users/User/Desktop/Website/Frontend/index.html): Login
- [`Frontend/dashboard.html`](/C:/Users/User/Desktop/Website/Frontend/dashboard.html): Dashboard
- [`Frontend/inventory.html`](/C:/Users/User/Desktop/Website/Frontend/inventory.html): Inventory
- [`Frontend/bank.html`](/C:/Users/User/Desktop/Website/Frontend/bank.html): Bank ledger
- [`Frontend/distribution.html`](/C:/Users/User/Desktop/Website/Frontend/distribution.html): Distribution
- [`Frontend/users.html`](/C:/Users/User/Desktop/Website/Frontend/users.html): User management

## Local setup

1. Copy [`\.env.example`](/C:/Users/User/Desktop/Website/.env.example) to `.env`.
2. Set `DATABASE_URL`, `JWT_SECRET`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD`.
3. Install dependencies:

```powershell
npm.cmd install
```

4. Generate Prisma client and push the schema:

```powershell
npm.cmd run prisma:generate
npm.cmd run prisma:push
```

5. Seed example users if needed:

```powershell
npm.cmd run seed
```

6. Start the API:

```powershell
npm.cmd run dev
```

7. Update [`Frontend/assets/js/config.js`](/C:/Users/User/Desktop/Website/Frontend/assets/js/config.js) so `API_BASE_URL` points to your backend.
8. Open [`Frontend/index.html`](/C:/Users/User/Desktop/Website/Frontend/index.html) in a local static server.

## Railway deployment

1. Push this project to GitHub and create a Railway project from that repository.
2. Add a PostgreSQL service in Railway.
3. In the API service variables, set `DATABASE_URL` as a reference to the PostgreSQL service `DATABASE_URL`.
4. Set these remaining Railway variables on the API service:
   - `JWT_SECRET`
   - `FRONTEND_URL`
   - `ADMIN_EMAIL`
   - `ADMIN_NAME`
   - `ADMIN_PASSWORD`
5. Railway will use [`railway.json`](/C:/Users/User/Desktop/Website/railway.json) to:
   - start the API with `npm start`
   - run `npm run prisma:generate && npm run prisma:push` before each deploy
   - health check the service at `/api/health`

The app boots the first admin automatically when no users exist and the admin env vars are present.

## Netlify deployment

1. Create a Netlify site from the same GitHub repository.
2. Keep [`netlify.toml`](/C:/Users/User/Desktop/Website/netlify.toml) in the repo root, or set the publish directory to `Frontend`.
3. In Netlify Site configuration, add:
   - `NETLIFY_API_BASE_URL=https://your-railway-app.up.railway.app`
4. Netlify will run `npm run build:frontend-config`, which generates [`runtime-config.js`](/C:/Users/User/Desktop/Website/Frontend/assets/js/runtime-config.js) with your live API URL before publishing the static site.
5. In Railway, set `FRONTEND_URL` to your Netlify site URL so CORS allows the frontend.

## Live data checklist

1. The Railway API service is deployed and responds at `/api/health`.
2. The Railway API service has `DATABASE_URL` wired to the Railway PostgreSQL service.
3. The Railway pre-deploy command has pushed the Prisma schema to PostgreSQL.
4. Netlify has `NETLIFY_API_BASE_URL` set to the Railway public URL.
5. Railway `FRONTEND_URL` matches your Netlify production URL exactly.
6. When you log into the deployed frontend, all reads and writes now flow through Railway and PostgreSQL.

## Official docs

- Railway deployments: https://docs.railway.com/deploy/deployments
- Railway PostgreSQL: https://docs.railway.com/databases/postgresql/
- Railway variables: https://docs.railway.com/variables
- Railway config as code: https://docs.railway.com/reference/config-as-code
- Netlify deploys: https://docs.netlify.com/site-deploys/create-deploys/
- Netlify redirects and config: https://docs.netlify.com/manage/routing/redirects/overview/

## Permissions model

- `ADMIN`: Full system access and user management
- `USER`: Access only to the pages explicitly granted

Available page permissions:

- `DASHBOARD`
- `INVENTORY`
- `BANK`
- `DISTRIBUTION`
- `USERS`

## Verification completed

- `node --check` passed for backend JS files
- `node --check` passed for frontend JS files
- `prisma generate` completed successfully
- `prisma validate` passed with a placeholder PostgreSQL connection string

## Not yet verified

- Live server boot against a real PostgreSQL instance
- End-to-end login and CRUD flows in a browser
