# UroAssist

![Backend Deploy](https://github.com/pabsdsr/urology_agent/actions/workflows/deploy-backend.yml/badge.svg)
![Frontend Deploy](https://github.com/pabsdsr/urology_agent/actions/workflows/deploy-frontend.yml/badge.svg)

Clinical assistant for urology practices: Entra sign-in, ModMed patient search, AI chat (CrewAI + Qdrant), practitioner schedule, on-call schedule admin, and **billing sheet submissions** with a review inbox.

## Documentation

| Area | Document |
|------|----------|
| Full-stack architecture (code map) | [CODEBASE_ARCHITECTURE.md](CODEBASE_ARCHITECTURE.md) |
| Frontend architecture | [client/CLIENT_ARCHITECTURE.md](client/CLIENT_ARCHITECTURE.md) |
| Frontend deployment (S3 + CloudFront) | [client/CLIENT_DEPLOYMENT.md](client/CLIENT_DEPLOYMENT.md) |
| Backend architecture | [server/SERVER_ARCHITECTURE.md](server/SERVER_ARCHITECTURE.md) |
| Backend deployment (Elastic Beanstalk) | [server/SERVER_DEPLOYMENT.md](server/SERVER_DEPLOYMENT.md) |
| Backend quick start + billing S3 | [server/README.md](server/README.md) |
| Frontend quick start | [client/README.md](client/README.md) |
| CI: frontend deploy | [.github/workflows/deploy-frontend.yml](.github/workflows/deploy-frontend.yml) |
| CI: backend deploy | [.github/workflows/deploy-backend.yml](.github/workflows/deploy-backend.yml) |
| CI: tests / lint | [.github/workflows/test.yml](.github/workflows/test.yml) |

## Local development

```bash
# Backend (port 8080)
cd server && uv sync && uv run python -m app.main

# Frontend (port 5173)
cd client && npm install && npm run dev
```

Set `VITE_API_URL=http://localhost:8080` in `client/.env.development`. Configure Entra, ModMed, and optional `BILLING_S3_BUCKET` in `server/.env` (see server docs).

## Tests

```bash
cd server && uv sync --group dev && uv run pytest
cd client && npm test
```
