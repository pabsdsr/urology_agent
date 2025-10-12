# Server Architecture Documentation

## Overview

UroAssist backend is a FastAPI-based clinical assistant system that integrates with ModMed EHR, uses CrewAI agents for intelligent query processing, and leverages AWS Bedrock for LLM capabilities.

**Tech Stack**:
- **Framework**: FastAPI (Python 3.11)
- **AI Framework**: CrewAI 0.126.0
- **LLM Provider**: AWS Bedrock (Claude 3.5 Sonnet)
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
│   │   ├── auth.py                # Login, logout endpoints
│   │   ├── all_patients.py        # Patient list endpoint
│   │   └── run_crew.py            # AI agent query endpoint
│   │
│   ├── services/                  # Business logic
│   │   ├── auth_service.py        # ModMed authentication
│   │   ├── client_service.py      # HTTP client singleton
│   │   ├── patient_embedder.py    # Qdrant vector operations
│   │   └── patient_info_service.py # Patient data retrieval
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
└── create_qdrant_collection.py   # Setup script
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
    
    # CORS configuration based on environment
    if os.getenv('ENVIRONMENT') == 'production':
        allowed_origins = ["https://uroassist.net", "https://api.uroassist.net"]
    else:
        allowed_origins = ["http://localhost:3000", "http://localhost:5173"]
    
    app.add_middleware(CORSMiddleware, allow_origins=allowed_origins, ...)
    
    # Register routes
    app.include_router(auth.router)
    app.include_router(all_patients.router)
    app.include_router(run_crew.router)
    
    return app
```

### 2. Authentication Service (`app/services/auth_service.py`)

**Purpose**: Handle ModMed authentication and session management.

**Key Functions**:

- `authenticate_user(username, password)`: Login to ModMed
  - Extracts practice ID from username format: `fhir_USERNAME`
  - Calls ModMed OAuth token endpoint
  - Returns JWT session token with practice URL

**Authentication Flow**:
```
1. User submits credentials → Frontend
2. POST /auth/login → auth.py route
3. auth_service.authenticate_user() → ModMed OAuth API
4. ModMed returns access token
5. Backend generates JWT with practice info
6. JWT returned to frontend (stored in AuthContext)
```

**JWT Payload**:
```json
{
  "username": "fhir_WpKHZ",
  "practice_url": "uropmsandbox460",
  "exp": 1760259295,
  "iat": 1760230495
}
```

### 3. Patient Info Service (`app/services/patient_info_service.py`)

**Purpose**: Fetch and parse patient data from ModMed FHIR API.

**Key Functions**:

- `get_all_patients(practice_url, access_token)`: Retrieve patient list
  - Calls ModMed `/Patient` endpoint
  - Parses FHIR bundle response
  - Extracts: ID, name, birthdate, gender, contact info

- `get_patient_info(patient_id, practice_url, access_token)`: Get detailed patient data
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
2. POST /api/run-crew → run_crew.py
3. ClinicalAssistantCrew.kickoff(query, patient_id)
4. Agent uses QdrantVectorSearchTool
5. Tool fetches relevant patient data
6. LLM (Claude) processes query + context
7. Structured response → Frontend
```

### 6. Routes (API Endpoints)

#### **Auth Routes** (`routes/auth.py`)

**Endpoints**:
- `POST /auth/login`: Authenticate user
  - Request: `{"username": "fhir_XXX", "password": "YYY"}`
  - Response: JWT token, practice URL, expiration

- `POST /auth/logout`: Invalidate session
  - Request: JWT token in Authorization header
  - Response: Success message

#### **Patient Routes** (`routes/all_patients.py`)

**Endpoints**:
- `GET /api/patients`: Get all patients for practice
  - Headers: Authorization (JWT)
  - Response: Array of patient objects

#### **Crew Routes** (`routes/run_crew.py`)

**Endpoints**:
- `POST /api/run-crew`: Execute clinical query
  - Request: `{"query": "...", "patient_id": "...", "practice_url": "..."}`
  - Response: AI-generated clinical response

## Data Models (`app/models.py`)

### Core Models

**LoginRequest**:
```python
class LoginRequest(BaseModel):
    username: str
    password: str
```

**LoginResponse**:
```python
class LoginResponse(BaseModel):
    success: bool
    session_token: str
    username: str
    practice_url: str
    expires_at: str
    message: str
```

**Patient**:
```python
class Patient(BaseModel):
    id: str
    name: str
    birthDate: Optional[str]
    gender: Optional[str]
    phone: Optional[str]
    email: Optional[str]
```

**CrewRunRequest**:
```python
class CrewRunRequest(BaseModel):
    query: str
    id: str
    practice_url: str
```

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

**JWT Tokens**:
- Signed with `JWT_SECRET_KEY` (env variable)
- Expiration: 8 hours
- Payload includes: username, practice_url

**Token Validation**:
- All protected routes check for valid JWT
- Expired tokens rejected with 401 Unauthorized

### 2. Data Privacy (HIPAA)

**Encryption in Transit**:
- ✅ HTTPS for all API calls (TLS 1.2+)
- ✅ Qdrant Cloud with TLS enabled
- ✅ AWS Bedrock uses encrypted connections

**Encryption at Rest**:
- ✅ AWS EBS volumes encrypted by default
- ✅ Qdrant Cloud encrypts stored vectors

**Access Control**:
- Practice-level data isolation
- JWT tokens scoped to specific practice
- No cross-practice data access

**Data Retention**:
- Patient embeddings stored indefinitely (consider TTL)
- No PHI in application logs
- Session tokens expire after 8 hours

### 3. Environment Variables

**Secrets Management**:
- All credentials stored as environment variables
- Never committed to git
- Set via `eb setenv` for production

**Required Variables**:
```bash
QDRANT_URL
QDRANT_API_KEY
MODMED_BASE_URL
MODMED_CLIENT_ID
MODMED_CLIENT_SECRET
JWT_SECRET_KEY
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

**Current State**: No caching implemented

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
export MODMED_CLIENT_ID="..."
export MODMED_CLIENT_SECRET="..."
export JWT_SECRET_KEY="..."
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

# Login
curl -X POST http://localhost:8080/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"fhir_XXX","password":"YYY"}'

# Get patients (replace JWT)
curl http://localhost:8080/api/patients \
  -H "Authorization: Bearer <JWT_TOKEN>"
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
- Check `MODMED_CLIENT_ID` and `MODMED_CLIENT_SECRET`
- Verify practice URL format: `PRACTICE_username`
- Ensure ModMed credentials are active

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

