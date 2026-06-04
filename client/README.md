# UroAssist frontend

React 19 + Vite SPA for UroAssist. See [CLIENT_ARCHITECTURE.md](./CLIENT_ARCHITECTURE.md) for routes, services, and auth flow.

## Quick start

```bash
npm install
cp .env.development.example .env.development   # if you maintain an example file
# Set VITE_API_URL=http://localhost:8080
npm run dev
```

Open http://localhost:5173 and sign in with Microsoft (Entra).

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev server (port 5173) |
| `npm run build` | Production build → `dist/` |
| `npm run preview` | Preview production build |
| `npm run lint` | ESLint |
| `npm test` | Vitest unit tests |

## Main features

- Clinical assistant chat with patient search (`/`)
- Practitioner schedule (`/schedule`)
- Billing sheet submit + submissions inbox (`/billing`, `/billing/submissions`)
- Admin on-call schedule editor and changelog

## Deployment

[CLIENT_DEPLOYMENT.md](./CLIENT_DEPLOYMENT.md) — S3 + CloudFront, `uroassist.net`.
