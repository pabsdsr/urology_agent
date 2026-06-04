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

## Run tests

```bash
uv sync --project server --group dev
uv run --project server pytest
```

**Docs:** [SERVER_ARCHITECTURE.md](./SERVER_ARCHITECTURE.md), [SERVER_DEPLOYMENT.md](./SERVER_DEPLOYMENT.md).

## Billing submissions storage

Billing uses a **dedicated S3 bucket** (separate from call schedule). The inbox list and billing sheet images both live in that bucket.

### Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `BILLING_S3_BUCKET` | Production | — | S3 bucket name (e.g. `uroassist-billing`) |
| `BILLING_S3_REGION` | No | `us-west-2` | AWS region for the billing bucket |
| `BILLING_SUBMISSIONS_INDEX_KEY` | No | `billing_submissions.json` | JSON index of all submissions |
| `BILLING_SHEETS_S3_PREFIX` | No | `billing_sheets/` | Prefix for image objects |

If `BILLING_S3_BUCKET` is **not** set, billing falls back to local files under `app/data/` (fine for local dev only).

### S3 bucket layout

```
s3://your-billing-bucket/
  billing_submissions.json          # metadata for all submissions
  billing_sheets/
    {submission-uuid}.png         # one image per submission
```

### AWS setup (new bucket)

1. Create a private S3 bucket (e.g. `uroassist-billing`) in the same region as your app (`us-west-2`).
2. Grant the backend IAM role/user `s3:GetObject`, `s3:PutObject`, and `s3:DeleteObject` on that bucket.
3. Set `BILLING_S3_BUCKET=uroassist-billing` in server `.env` and in production secrets (Fly.io / EB).
4. Restart the API. New submissions will write only to this bucket.

**Note:** Submissions previously stored under `uroassist-call-schedule` are not migrated automatically. Re-submit or copy objects into the new bucket if you need old records.

### Curated CPT / ICD-10 codes

Urology-focused code lists ship with the API (`app/data/billing_cpt_codes.json`, `billing_icd10_codes.json`). Search endpoints:

- `GET /billing/codes/cpt?q=...`
- `GET /billing/codes/icd10?q=...`

No separate bucket is required for codes.

### Billing API (summary)

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| `POST` | `/billing/submit` | Any signed-in user | Multipart: patient fields + billing sheet image |
| `GET` | `/billing/submissions` | Any signed-in user | Newest-first list |
| `GET` | `/billing/submissions/{id}/sheet` | Any signed-in user | Inline image (safe `Content-Disposition`) |
| `PATCH` | `/billing/submissions/{id}/processed` | Any signed-in user | JSON `{ "processed": true \| false }` |
| `PATCH` | `/billing/submissions/{id}` | `wkim@urologymedical.com` only | Edit fields; optional new image |
| `DELETE` | `/billing/submissions/{id}` | `wkim@urologymedical.com` only | Removes index row + sheet file |

### Billing troubleshooting

- `400 Billing sheet must be a supported image file` — upload must be `jpeg/png/webp/heic`.
- `400 Billing sheet image exceeds the 10MB limit` — attachment is too large.
- `404 Billing sheet not found` — index row exists but the image object is missing in `BILLING_S3_BUCKET`.
- `500 Failed to save billing submission` — check logs for S3 permission or `BILLING_S3_BUCKET` misconfiguration.
- Mobile upload “network error” with no API error — EB nginx may still be on the default **1MB** body limit; redeploy after adding `server/.platform/nginx/` (see [SERVER_DEPLOYMENT.md](./SERVER_DEPLOYMENT.md)).
