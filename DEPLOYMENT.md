# Deployment Guide

This project is set up for Git-based auto deploys:

- GitHub stores the source of truth
- Railway deploys the Express API and hosts PostgreSQL
- Netlify deploys the static `Frontend` folder

## 1. Push the repo to GitHub

Create a GitHub repository, then push the project so Railway and Netlify can both connect to it for automatic redeploys.

## 2. Deploy the backend to Railway

1. Create a new Railway project from your GitHub repository.
2. Select the repo root as the service source.
3. Add a PostgreSQL service to the same Railway project.
4. In the API service variables, set:
   - `DATABASE_URL` to the PostgreSQL service `DATABASE_URL` reference
   - `JWT_SECRET` to a long random secret
   - `FRONTEND_URL` to your Netlify site URL
   - `ADMIN_USERNAME` to your first admin login username
   - `ADMIN_NAME` to your first admin display name
   - `ADMIN_PASSWORD` to your first admin password
   - `SECRETARY_DISCORD_WEBHOOK_URL` to your Discord incoming webhook URL if you want Secretary posts to broadcast into Discord
   - `INVENTORY_DISCORD_WEBHOOK_URL` to your Discord incoming webhook URL if you want one-click stock-take updates from the Inventory page
   - optionally `SECRETARY_DISCORD_AUDIENCES` to a JSON array of `{ key, label, roleId }` entries if you want to override the built-in audience presets

[`railway.json`](/C:/Users/User/Desktop/Website/railway.json) is already configured to:

- start the API with `npm start`
- run `npm run prisma:generate && npm run prisma:push` before deployment
- health check the API at `/api/health`

After deploy, confirm the API is live at:

- `https://your-railway-domain/api/health`

## 3. Deploy the frontend to Netlify

1. Create a Netlify site from the same GitHub repository.
2. Let Netlify use [`netlify.toml`](/C:/Users/User/Desktop/Website/netlify.toml).
3. In Netlify site environment variables, add:
   - `NETLIFY_API_BASE_URL=https://your-railway-domain`

[`netlify.toml`](/C:/Users/User/Desktop/Website/netlify.toml) now runs:

```bash
npm run build:frontend-config
```

That generates [`runtime-config.js`](/C:/Users/User/Desktop/Website/Frontend/assets/js/runtime-config.js) during deploy so the static frontend points at the Railway API automatically.

## 4. Make sure live data works

For the frontend to show true backend and database data:

1. Railway API must be live.
2. Railway PostgreSQL must be attached through `DATABASE_URL`.
3. Prisma schema must be pushed successfully.
4. Netlify must build with `NETLIFY_API_BASE_URL`.
5. Railway `FRONTEND_URL` must exactly match the Netlify URL.

Once that is in place, the deployed HTML pages call Railway, and Railway reads/writes PostgreSQL through Prisma.

## 5. Auto redeploy workflow

After both services are connected to GitHub:

1. make changes locally
2. commit them
3. push to GitHub
4. Railway redeploys the backend
5. Netlify redeploys the frontend

That gives you the workflow you described: every push updates the live app automatically.
