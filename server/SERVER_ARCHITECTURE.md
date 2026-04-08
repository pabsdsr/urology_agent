# Server Architecture Documentation

## Overview

UroAssist backend is a FastAPI-based clinical assistant system that integrates with ModMed EHR, uses CrewAI agents for intelligent query processing, and leverages AWS Bedrock for LLM capabilities.

**Tech Stack**:
- **Framework**: FastAPI (Python 3.11)
- **AI Framework**: CrewAI 0.126.0
- **LLM Provider**: AWS Bedrock (Llama4 Maverick 17b)
- **Vector Database**: Qdrant Cloud
- **EHR Integration**: ModMed FHIR API
- **Package Manager**: UV (fast Python installer)
- **Deployment**: Docker on AWS Elastic Beanstalk

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (React)                         │
│                     http://localhost:5173                        │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            │ HTTPS/REST API
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│                   FastAPI Application Layer                      │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐   │
│  │   Auth       │  │   Patients   │  │   Crew Runner      │   │
│  │   Routes     │  │   Routes     │  │   Routes           │   │
│  └──────┬───────┘  └──────┬───────┘  └─────────┬──────────┘   │
│         │                  │                     │               │
│         ↓                  ↓                     ↓               │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐   │
│  │ Auth Service │  │ Patient Info │  │ Clinical Assistant │   │
│  │              │  │ Service      │  │ Crew               │   │
│  └──────┬───────┘  └──────┬───────┘  └─────────┬──────────┘   │
└─────────┼──────────────────┼────────────────────┼──────────────┘
          │                  │                     │
          │                  │                     │
┌─────────┴──────────────────┴─────────────────────┴──────────────┐
│                      External Services                            │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐    │
│  │ ModMed API   │  │ Qdrant Cloud │  │ AWS Bedrock        │    │
│  │ (FHIR)       │  │ (Vectors)    │  │ (LLMs)             │    │
│  └──────────────┘  └──────────────┘  └────────────────────┘    │
└───────────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
server/
├── app/
│   ├── __init__.py
│   ├── main.py                    # FastAPI app entry point
│   ├── models.py                  # Pydantic models
│   │
│   ├── routes/                    # API endpoints
│   │   ├── auth.py                # /auth/me, /auth/logout (Entra bearer)
│   │   ├── patients.py            # /patients (FHIR name search)
│   │   ├── run_crew.py            # /run_crew (clinical assistant)
│   │   ├── appointments.py       # /schedule (practitioner schedule)
│   │   └── call_schedule.py       # /call-schedule (on-call grid + audit)
│   │
│   ├── services/                  # Business logic
│   │   ├── auth_service.py        # Entra token validation + ModMed bootstrap
│   │   ├── entra_jwt.py          # JWKS validation for Entra access tokens
│   │   ├── client_service.py      # HTTP client singleton
│   │   ├── patient_embedder.py    # Qdrant vector operations
│   │   ├── patient_info_service.py # Patient FHIR fetch, embed, aggregate
│   │   ├── patient_name_cache_store.py  # DynamoDB-backed display-name cache (optional)
│   │   └── patient_name_refresh.py      # Background cache refresh helpers
│   │
│   └── crew/                      # CrewAI agents
│       ├── crew.py                # Crew configuration
│       ├── config/
│       │   ├── agents.yaml        # Agent definitions
│       │   └── tasks.yaml         # Task definitions
│       └── tools/
│           └── tools.py           # Custom RAG tools
│
├── .ebextensions/                 # AWS EB config
│   ├── 01-https.config
│   ├── 02-python.config
│   ├── 03-vpc-network.config
│   └── 04-disk-size.config
│
├── Dockerfile                     # Container definition
├── pyproject.toml                 # Dependencies
├── uv.lock                        # Locked dependencies
└── scripts/
    ├── create_qdrant_collection.py    # Qdrant collection setup
    └── populate_patient_name_cache.py # One-off / ops cache backfill
```

## Core Components

### 1. Main Application (`app/main.py`)

**Purpose**: FastAPI application initialization and configuration.

**Key Features**:
- CORS middleware configuration (production vs development)
- Route registration
- Lifespan management for HTTP client cleanup
- Health check endpoint

**Code Structure**:
```python
def create_app():
    app = FastAPI(title="UroAssist Backend")
    # CORS: production uses www.uroassist.net / uroassist.net / api.uroassist.net;
    # development uses http://localhost:5173
    app.add_middleware(CORSMiddleware, allow_origins=allowed_origins, ...)

    app.include_router(auth.router)
    app.include_router(run_crew.router)
    app.include_router(patients.router)
    app.include_router(appointments.router)
    app.include_router(call_schedule.router)

    return app
```

### 2. Authentication Service (`app/services/auth_service.py`)

**Purpose**: Validate **Microsoft Entra** access tokens, map the signed-in user to a practice via `AUTHORIZED_EMAILS`, then bootstrap **ModMed** (FHIR) and **Qdrant** tooling for that session.

**Key behavior**:

- `resolve_session_user_from_access_token(access_token)`: Validates the Entra JWT (JWKS) using `ENTRA_TENANT_ID` and `ENTRA_CLIENT_ID` audiences, reads email-style claims, checks `AUTHORIZED_EMAILS` → practice name, loads `PRACTICE_<practice>` ModMed credentials, obtains ModMed tokens, and caches per Entra `oid`.
- `try_clear_cache_for_access_token(token)`: Best-effort in-process cache clear on logout (works with expired tokens via unverified decode fallback).

**Authentication flow (high level)**:
```
1. User signs in with Microsoft (MSAL) in the SPA → obtains Entra access token
2. SPA sends Authorization: Bearer <Entra access token> on API calls
3. auth_service validates token + resolves practice + ModMed session (server-side cache)
```

There is **no** `POST /auth/login` and **no** app-issued JWT for API auth; the API trusts **Entra-issued** bearer tokens.

### 3. Patient Info Service (`app/services/patient_info_service.py`)

**Purpose**: Fetch and parse patient data from ModMed FHIR API.

**Key Functions**:

- `get_patient_info(...)`: Load and aggregate a single patient’s FHIR data for RAG
  - Fetches: Patient demographics, Encounters, Conditions, Medications, Observations
  - Aggregates all FHIR resources for the patient
  - Returns comprehensive patient record

**FHIR Resources Retrieved**:
- `Patient`: Demographics
- `Encounter`: Visits, appointments
- `Condition`: Diagnoses, medical conditions
- `MedicationRequest`: Prescribed medications
- `Observation`: Labs, vitals, test results

### 4. Patient Embedder (`app/services/patient_embedder.py`)

**Purpose**: Manage vector embeddings for semantic patient search using Qdrant.

**Key Functions**:

- `embed_patient(patient_id, patient_info, practice_url)`: Create vector embedding
  - Converts patient data to text representation
  - Generates embedding using AWS Bedrock (Titan Embed model)
  - Stores in Qdrant with metadata

- `search_similar_patients(query, practice_url, limit)`: Semantic search
  - Embeds search query
  - Performs vector similarity search in Qdrant
  - Returns top-k similar patients

**Vector Storage**:
- **Collection**: `patient_embeddings`
- **Vector Dimensions**: 1024 (Titan Embed Text v2)
- **Metadata**: `patient_id`, `practice_url`
- **Distance Metric**: Cosine similarity

**Embedding Process**:
```
Patient Data → Text Representation → AWS Bedrock Titan → Vector (1024-dim)
                                                            ↓
                                                    Qdrant Cloud Storage
```

### 5. CrewAI Clinical Assistant (`app/crew/crew.py`)

**Purpose**: Intelligent agent system for clinical query processing.

**Agent Configuration** (`config/agents.yaml`):
```yaml
clinical_assistant_specialist:
  role: Clinical Assistant Specialist
  goal: Provide accurate, evidence-based medical information
  backstory: Expert healthcare professional with deep knowledge
  llm: bedrock/anthropic.claude-3-5-sonnet-20241022-v2:0
```

**Task Configuration** (`config/tasks.yaml`):
```yaml
clinical_query_task:
  description: Analyze patient query and provide comprehensive response
  expected_output: Clear, actionable medical guidance
  agent: clinical_assistant_specialist
```

**Custom Tools** (`tools/tools.py`):

- `QdrantVectorSearchTool`: RAG tool for patient data retrieval
  - Searches Qdrant for relevant patient information
  - Retrieves full patient records from ModMed
  - Provides context to LLM for informed responses

**Agent Execution Flow**:
```
1. User query → Frontend
2. POST /run_crew → run_crew.py
3. ClinicalAssistantCrew.kickoff(query, patient_id)
4. Agent uses QdrantVectorSearchTool
5. Tool fetches relevant patient data
6. LLM (Claude) processes query + context
7. Structured response → Frontend
```

### 6. Routes (API Endpoints)

#### **Auth Routes** (`routes/auth.py`)

**Endpoints**:
- `GET /auth/me`: Current user profile (requires `Authorization: Bearer <Entra access token>`)
  - Response includes `email`, `practice_url`, `is_admin`, etc.

- `POST /auth/logout`: Best-effort clear of server-side cached ModMed/Qdrant state for this Entra user
  - Optional `Authorization: Bearer <token>` (expired tokens still attempt cache clear)
  - Client should also sign out with MSAL

#### **Patient Routes** (`routes/patients.py`)

**Endpoints**:
- `GET /patients`: FHIR name search (query params `given` and/or `family`)
  - Headers: `Authorization: Bearer <Entra access token>`
  - Response: List of `{ id, familyName, givenName, dob }`

#### **Schedule Routes** (`routes/appointments.py`)

**Endpoints** (representative):
- `GET /schedule`: Practitioner schedule for an inclusive date range (`start`, `end`)
- `GET /schedule/appointment_types`: Appointment type and surgery location mappings (optional date window)

#### **Call Schedule Routes** (`routes/call_schedule.py`)

**Endpoints**:
- `GET /call-schedule`: On-call grid for `start`–`end`
- `POST /call-schedule/week`: Save a week of on-call entries (any authenticated user; changes are audited)
- `POST /call-schedule/upload`: Upload CSV/XLSX schedule
- `GET /call-schedule/audit`: Paginated change log (admin)

#### **Crew Routes** (`routes/run_crew.py`)

**Endpoints**:
- `POST /run_crew`: Run the clinical assistant for a patient
  - Request body: `CrewInput` — `query` and `id` (patient id). `practice_url` comes from the authenticated session.
  - Response: `{ "result": "<assistant text>" }`

## Data Models (`app/models.py`)

### Core Models

**SessionUser** (server-side session object after Entra bootstrap; not all fields are exposed on `GET /auth/me`):
- Holds Entra-derived identity (`email`, `username`), resolved `practice_url`, ModMed tokens, optional Qdrant tool handle, and cache metadata after `resolve_session_user_from_access_token`.

**Route-local bodies**: Request schemas such as `CrewInput` live beside their handlers (e.g. `routes/run_crew.py`); `routes/call_schedule.py` defines week/upload payloads.

## External Integrations

### 1. ModMed FHIR API

**Base URL**: `https://api-rest.modmed.com/api`

**Authentication**: OAuth 2.0
- Client credentials grant
- Access tokens valid for 8 hours

**Key Endpoints**:
- `POST /token`: Get access token
- `GET /{practice}/Patient`: List patients
- `GET /{practice}/Patient/{id}`: Get patient details
- `GET /{practice}/Encounter?patient={id}`: Get encounters
- `GET /{practice}/Condition?patient={id}`: Get conditions
- `GET /{practice}/MedicationRequest?patient={id}`: Get medications
- `GET /{practice}/Observation?patient={id}`: Get observations

**Rate Limits**: Unknown (implement exponential backoff)

### 2. Qdrant Cloud

**Purpose**: Vector database for semantic patient search

**Connection**:
- URL: `https://your-cluster.qdrant.io`
- API Key authentication
- TLS encryption enforced (`https=True`)

**Collection Schema**:
```python
{
    "collection_name": "patient_embeddings",
    "vectors_config": {
        "size": 1024,  # Titan Embed dimensions
        "distance": "Cosine"
    }
}
```

**Operations**:
- `upsert`: Store patient embeddings
- `search`: Semantic similarity search
- Metadata filtering by `practice_url`

### 3. AWS Bedrock

**Purpose**: LLM inference and text embeddings

**Models Used**:
- **LLM**: `anthropic.claude-3-5-sonnet-20241022-v2:0`
  - Used by CrewAI agents for reasoning
  - Context window: 200k tokens
  - Supports tool use (function calling)

- **Embeddings**: `amazon.titan-embed-text-v2:0`
  - Vector dimensions: 1024
  - Used for patient data embeddings

**Authentication**: IAM role (`aws-elasticbeanstalk-ec2-role`)

**SDK**: `boto3` (AWS SDK for Python)

## Security Considerations

### 1. Authentication & Authorization

**Entra access tokens**:
- Issued by Microsoft Entra ID; validated on the API using JWKS (`app/services/entra_jwt.py`)
- Configure `ENTRA_TENANT_ID`, `ENTRA_CLIENT_ID`, and (optionally) `ENTRA_ADMIN_APP_ROLE`
- ModMed credentials are **not** the same as Entra credentials; they come from `PRACTICE_*` env vars after the user is mapped via `AUTHORIZED_EMAILS`

**Token validation**:
- Protected routes expect `Authorization: Bearer <Entra access token>`
- Invalid or unauthorized tokens → `401 Unauthorized`

### 2. Data Privacy (HIPAA)

**Encryption in Transit**:
- ✅ HTTPS for all API calls (TLS 1.2+)
- ✅ Qdrant Cloud with TLS enabled
- ✅ AWS Bedrock uses encrypted connections

**Encryption at Rest**:
- ✅ AWS EBS volumes encrypted by default
- ✅ Qdrant Cloud encrypts stored vectors

**Access Control**:
- Practice-level data isolation (resolved per Entra user email → practice mapping)
- No cross-practice data access

**Data Retention**:
- Patient embeddings stored indefinitely (consider TTL)
- No PHI in application logs
- Entra token lifetime is controlled by Microsoft identity settings; the API validates `exp` when verifying tokens

### 3. Environment Variables

**Secrets Management**:
- All credentials stored as environment variables
- Never committed to git
- Set via `eb setenv` for production

**Required Variables (representative)**:
```bash
QDRANT_URL
QDRANT_API_KEY
ENTRA_TENANT_ID
ENTRA_CLIENT_ID
AUTHORIZED_EMAILS
PRACTICE_<firm_name>   # ModMed FHIR user/pass + x-api-key for that firm
AWS_REGION
MODEL
```

## Performance Considerations

### 1. HTTP Client Pooling

**Implementation**: `client_service.py`
- Single `httpx.AsyncClient` instance
- Connection pooling for ModMed API
- Reused across requests
- Proper cleanup on shutdown

### 2. Caching Strategies

**Current State**: In-process ModMed/Qdrant session cache per Entra user in `auth_service`; optional DynamoDB-backed patient **display name** cache (`patient_name_cache_store`).

**Recommendations**:
- Cache patient list per practice (TTL: 5 minutes)
- Cache patient details (TTL: 1 hour)
- Cache Qdrant search results (TTL: 10 minutes)

### 3. Rate Limiting

**Current State**: No rate limiting

**Recommendations**:
- Implement per-user rate limits (e.g., 100 req/min)
- Use Redis for distributed rate limiting
- Backpressure for ModMed API calls

### 4. Database Optimization

**Qdrant Performance**:
- Vector search: ~50ms (P95)
- Collection sharding for scale
- Use payload filtering for practice isolation

## Error Handling

### 1. Exception Handling

**Strategy**: Centralized error responses
```python
try:
    result = await external_api_call()
except httpx.HTTPError as e:
    raise HTTPException(status_code=502, detail="External service error")
except Exception as e:
    logger.error(f"Unexpected error: {e}")
    raise HTTPException(status_code=500, detail="Internal server error")
```

### 2. Logging

**Configuration**: `logging` module
- **Level**: INFO
- **Format**: Timestamp, module, level, message
- **Outputs**: 
  - Console (stdout)
  - File (`app.log`)

**Log Locations**:
- Local: `server/app.log`
- AWS: `/var/log/eb-docker/containers/eb-current-app/*.log`

**What to Log**:
- ✅ Authentication attempts
- ✅ API errors (external services)
- ✅ Agent execution results
- ❌ PHI / patient data
- ❌ Credentials

### 3. Health Checks

**Endpoint**: `GET /health`
- Returns: `{"status": "healthy", "service": "UroAssist-backend"}`
- Used by AWS load balancer
- No authentication required

## Deployment Architecture

### Docker Container

**Build Process**:
1. Stage 1 (Builder):
   - Install dependencies with UV
   - Create virtual environment
   - Clean up cache (critical for disk space)

2. Stage 2 (Runtime):
   - Copy virtual environment
   - Copy application code
   - Expose port 8080
   - Start uvicorn server

**Runtime**:
- Base image: `python:3.11-slim-bookworm`
- Port: 8080
- Server: Uvicorn (ASGI)

### AWS Elastic Beanstalk

**Environment**:
- Platform: Docker on Amazon Linux 2
- Instance: t3.small (2 vCPU, 2GB RAM)
- Disk: 20GB gp3 EBS volume
- Auto-scaling: 1-4 instances (configurable)

**Networking**:
- VPC with public IP (for outbound API calls)
- Application Load Balancer (ALB)
- Security groups for HTTP/HTTPS

**Monitoring**:
- CloudWatch logs (stdout/stderr)
- EB health dashboard
- ALB access logs

## Development Workflow

### Local Development

```bash
# Setup
cd server
python -m venv .venv
source .venv/bin/activate  # or .venv\Scripts\activate on Windows
pip install uv
uv sync

# Set environment variables
export QDRANT_URL="..."
export QDRANT_API_KEY="..."
export ENTRA_TENANT_ID="..."
export ENTRA_CLIENT_ID="..."
export AUTHORIZED_EMAILS="user@org.com:firm_name"
export PRACTICE_firm_name="fhir_user,password,x-api-key"
export AWS_REGION="us-west-2"
export MODEL="anthropic.claude-3-5-sonnet-20241022-v2:0"

# Run server
python -m app.main
# Server runs on http://localhost:8080
```

### Testing

**Manual Testing**:
```bash
# Health check
curl http://localhost:8080/health

# Authenticated call (obtain Entra access token via MSAL in the SPA, then:)
curl http://localhost:8080/auth/me \
  -H "Authorization: Bearer <ENTRA_ACCESS_TOKEN>"
```

**Unit Tests**: Not implemented (TODO)

### CI/CD

**Current Process**: Manual deployment
```bash
cd server
eb deploy
```

**Recommended**:
- GitHub Actions for automated testing
- Automated deployment on merge to `main`
- Environment-specific branches (dev, staging, prod)

## Troubleshooting

### Common Issues

**1. "ModMed authentication failed"**
- Verify `AUTHORIZED_EMAILS` maps the user’s email to the correct practice key
- Check `PRACTICE_<practice>` env vars (FHIR username, password, x-api-key) for that practice
- Ensure tokens are not expired and ModMed credentials are still valid

**2. "Qdrant connection timeout"**
- Verify `QDRANT_URL` and `QDRANT_API_KEY`
- Check EC2 security group allows outbound HTTPS
- Ensure `AssociatePublicIpAddress: true` in EB config

**3. "AWS Bedrock access denied"**
- Verify IAM role `aws-elasticbeanstalk-ec2-role` has Bedrock permissions
- Check model ID is correct: `anthropic.claude-3-5-sonnet-20241022-v2:0`
- Ensure `AWS_REGION` is set correctly

**4. "Docker build fails - No space left on device"**
- Increase EBS volume to 20GB (see `04-disk-size.config`)
- Ensure Dockerfile includes `rm -rf /root/.cache/uv`

### Debug Commands

```bash
# Check environment variables
eb printenv

# View logs
eb logs --all
eb ssh  # SSH into EC2 instance

# Check Docker container
sudo docker ps
sudo docker logs <container_id>

# Check application locally
curl localhost:8080/health
```

## Future Enhancements

### Short-term
- [ ] Add unit tests (pytest)
- [ ] Implement Redis caching
- [ ] Add rate limiting middleware
- [ ] Comprehensive error logging

### Medium-term
- [ ] WebSocket support for real-time updates
- [ ] Background job queue (Celery/Redis)
- [ ] Pagination for patient list
- [ ] Advanced search filters

### Long-term
- [ ] Multi-practice support in single deployment
- [ ] Role-based access control (RBAC)
- [ ] Audit logging for HIPAA compliance
- [ ] Advanced analytics dashboard
- [ ] Support for additional EHR systems

## References

- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [CrewAI Documentation](https://docs.crewai.com/)
- [AWS Bedrock Documentation](https://docs.aws.amazon.com/bedrock/)
- [Qdrant Documentation](https://qdrant.tech/documentation/)
- [ModMed FHIR API](https://api-rest.modmed.com/docs)
- [HIPAA Compliance Guide](https://www.hhs.gov/hipaa/index.html)

