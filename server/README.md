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

Billing uses a **dedicated S3 bucket** (separate from call schedule). Submissions are stored for in-app review; **no outbound email is sent**. The inbox list and billing sheet images both live in that bucket.

### Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `BILLING_S3_BUCKET` | Production | — | S3 bucket name (e.g. `uroassist-billing`) |
| `BILLING_S3_REGION` | No | `us-west-2` | AWS region for the billing bucket |
| `BILLING_SUBMISSIONS_INDEX_KEY` | No | `billing_submissions.json` | JSON index of all submissions |
| `BILLING_SHEETS_S3_PREFIX` | No | `billing_sheets/` | Prefix for image objects |

Billing access uses **Microsoft Entra app roles** (same pattern as call schedule `admin`):

| Variable | Default role value | Grants |
|----------|-------------------|--------|
| `ENTRA_BILLING_STAFF_APP_ROLE` | `practitioner` | Submit, edit, delete, code search |
| `ENTRA_BILLING_PROCESSOR_APP_ROLE` | `billing` | Mark submissions processed |

Assign these roles in Entra under your enterprise app → Users and groups. Users with either role can view the inbox and sheets.

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

Urology-focused code lists ship with the API (`app/data/billing_cpt_codes.json`, `billing_icd10_codes.json`, `billing_cpt_modifiers.json`). Search endpoints:

- `GET /billing/codes/cpt?q=...`
- `GET /billing/codes/icd10?q=...`
- `GET /billing/codes/modifiers?q=...`

No separate bucket is required for codes.

### Billing API (summary)

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| `POST` | `/billing/submit` | `practitioner` role | Multipart: patient fields + optional face sheet |
| `GET` | `/billing/submissions` | `practitioner` or `billing` | Newest-first list |
| `GET` | `/billing/submissions/{id}/sheet` | `practitioner` or `billing` | Inline image |
| `PATCH` | `/billing/submissions/{id}/processed` | `billing` role | JSON `{ "processed": true \| false }` |
| `PATCH` | `/billing/submissions/{id}` | `practitioner` role | Edit fields; optional new image |
| `DELETE` | `/billing/submissions/{id}` | `practitioner` role | Removes index row + sheet file |
| `GET` | `/billing/codes/*` | `practitioner` role | CPT / ICD-10 / modifier search |

### Billing troubleshooting

- `400 Billing sheet must be a supported image file` — upload must be `jpeg/png/webp/heic`.
- `400 Billing sheet image exceeds the 10MB limit` — attachment is too large.
- `404 Billing sheet not found` — index row exists but the image object is missing in `BILLING_S3_BUCKET`.
- `500 Failed to save billing submission` — check logs for S3 permission or `BILLING_S3_BUCKET` misconfiguration.
