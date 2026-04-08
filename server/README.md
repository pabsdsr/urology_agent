# UroAssist backend (FastAPI)

## Quick start

```bash
cd server
pip install uv
uv sync
# Set env vars (see SERVER_ARCHITECTURE.md): QDRANT_*, ENTRA_*, AUTHORIZED_EMAILS, PRACTICE_*, MODEL, etc.
uv run python -m app.main
```

Or activate `.venv` after `uv sync` and run `python -m app.main`.

**Docs:** [SERVER_ARCHITECTURE.md](./SERVER_ARCHITECTURE.md), [SERVER_DEPLOYMENT.md](./SERVER_DEPLOYMENT.md).
