# Backend Deployment Guide - AWS Elastic Beanstalk

## Overview

FastAPI backend deployed on AWS Elastic Beanstalk with HTTPS and custom domain.

- **URL**: https://api.uroassist.net
- **Region**: us-west-2
- **Platform**: Docker on Amazon Linux 2
- **Instance**: t3.small, 20GB disk

## Architecture

```
Internet → DNS (Route 53) → Load Balancer (HTTPS:443) → EC2 (Docker/FastAPI) → External APIs
```

## Prerequisites

```bash
# Install required tools
pip install awsebcli
aws configure  # Configure AWS credentials
```

**AWS Resources Needed**:
- Domain registered (Route 53)
- SSL Certificate (ACM)
- IAM roles: `aws-elasticbeanstalk-ec2-role`, `aws-elasticbeanstalk-service-role`

## Step 1: Application Configuration

### Dockerfile

Multi-stage build with UV package manager:

```dockerfile
FROM python:3.11-bookworm AS builder
RUN pip install uv==0.7.12
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN touch README.md && \
    uv venv && \
    uv sync && \
    rm -rf /root/.cache/uv  # Critical: prevents disk space issues

FROM python:3.11-slim-bookworm AS runtime
ENV VIRTUAL_ENV=/app/.venv \
    PATH="/app/.venv/bin:$PATH"
COPY --from=builder ${VIRTUAL_ENV} ${VIRTUAL_ENV}
COPY app ./app
EXPOSE 8080
ENTRYPOINT ["python", "-m", "app.main"]
```

### Elastic Beanstalk Configuration

Create `.ebextensions/` directory with these files:

**`.ebextensions/01-https.config`**:
```yaml
option_settings:
  # Environment variables for production
  aws:elasticbeanstalk:application:environment:
    ENVIRONMENT: production
    
  # Security settings
  aws:elasticbeanstalk:environment:
    ServiceRole: aws-elasticbeanstalk-service-role
    
  # Instance profile for Bedrock access
  aws:autoscaling:launchconfiguration:
    IamInstanceProfile: aws-elasticbeanstalk-ec2-role
```

**`.ebextensions/02-python.config`**:
```yaml
option_settings:
  # Environment variables for production
  aws:elasticbeanstalk:application:environment:
    ENVIRONMENT: production
    PORT: 8080
  
  # Docker platform uses Dockerfile CMD, not WSGIPath
```

**`.ebextensions/03-vpc-network.config`**:
```yaml
option_settings:
  # Ensure outbound internet access for ModMed API calls
  aws:ec2:vpc:
    AssociatePublicIpAddress: true
  
  # Allow all outbound traffic (needed for ModMed, Qdrant, Bedrock API calls)
  aws:autoscaling:launchconfiguration:
    SecurityGroups: default
```

**`.ebextensions/04-disk-size.config`**:
```yaml
option_settings:
  aws:autoscaling:launchconfiguration:
    RootVolumeSize: 20
    RootVolumeType: gp3

# Increase root volume from default 8GB to 20GB to accommodate Docker build
```

> **Note on HTTPS Listener**: The HTTPS listener (port 443) is configured via the AWS Console after the first deployment. Adding it to `.ebextensions` can cause "listener already exists" errors on subsequent deployments. Configure it manually in **EC2 → Load Balancers → Listeners** tab.

### CORS Configuration

In `app/main.py`:

```python
def create_app():
    app = FastAPI(title="UroAssist Backend")
    
    allowed_origins = []
    if os.getenv('ENVIRONMENT') == 'production':
        allowed_origins = [
            "https://uroassist.net",
            "https://api.uroassist.net",
            "http://localhost:3000",  # For testing
            "http://localhost:5173",
        ]
    else:
        allowed_origins = [
            "http://localhost:3000",
            "http://localhost:5173",
            "http://localhost:8080"
        ]
    
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    
    @app.get("/health")
    def health_check():
        return {"status": "healthy", "service": "UroAssist-backend"}
    
    return app
```

## Step 2: Domain & SSL Setup

### Register Domain

1. **Route 53 → Register domain** (`uroassist.net`, ~$17/year)
2. Verify hosted zone created automatically

### Create SSL Certificate

1. **Certificate Manager (us-west-2)** → Request certificate
2. Add domains: `uroassist.net`, `*.uroassist.net`
3. Choose **DNS validation**
4. Click **Create records in Route 53** (automatic validation)
5. Wait 5-10 minutes for **Issued** status
6. Copy certificate ARN for use in config

**Important**: Certificate must be in same region as Elastic Beanstalk (us-west-2)

## Step 3: Deploy to Elastic Beanstalk

```bash
# Initialize EB
cd /path/to/server
eb init
# Select: us-west-2, Docker platform, application name "UroAssist-backend"

# Create environment
eb create production --instance-type t3.small

# Set environment variables
eb setenv \
  QDRANT_URL="https://your-cluster.qdrant.io" \
  QDRANT_API_KEY="your-key" \
  MODMED_BASE_URL="https://api-rest.modmed.com/api" \
  MODMED_CLIENT_ID="your-id" \
  MODMED_CLIENT_SECRET="your-secret" \
  JWT_SECRET_KEY="your-jwt-secret" \
  AWS_REGION="us-west-2" \
  MODEL="anthropic.claude-3-5-sonnet-20241022-v2:0"

# Deploy
eb deploy
```

## Step 4: Configure DNS

1. **Route 53 → Hosted zones → uroassist.net**
2. **Create record**:
   - Record name: `api`
   - Record type: **A (Alias)**
   - Route traffic to: **Alias to Elastic Beanstalk environment**
   - Region: us-west-2
   - Environment: Select your production environment
3. **Create records**

Verify DNS:
```bash
nslookup api.uroassist.net
```

## Step 5: Configure Load Balancer HTTPS Listener

After the initial deployment, you need to manually configure the HTTPS listener:

1. **EC2 → Load Balancers** → Select your EB load balancer (e.g., `awseb--AWSEB-...`)
2. **Listeners tab** → **Add listener**
3. Configure:
   - **Protocol**: HTTPS
   - **Port**: 443
   - **Default action**: Forward to (select the same target group as HTTP:80)
   - **Security policy**: `ELBSecurityPolicy-2016-08`
   - **SSL certificate**: Select your `*.uroassist.net` certificate from ACM
4. **Add**

> **Why manual?** Adding the HTTPS listener to `.ebextensions` can cause "listener already exists" errors on subsequent deployments. Manual configuration is more reliable.

## Step 6: Configure Security Groups

### Load Balancer Security Group

Find: **EC2 → Security Groups** (search for security group attached to your load balancer)

**Inbound Rules** (must include both IPv4 and IPv6):
- HTTP (80) from 0.0.0.0/0 (IPv4)
- HTTPS (443) from 0.0.0.0/0 (IPv4) ⚠️ **Critical - often missing**
- HTTPS (443) from ::/0 (IPv6)

**Outbound Rules**:
- All traffic to 0.0.0.0/0

### EC2 Instance Security Group

Find: **EC2 → Security Groups** (search for `AWSEBSecurityGroup`)

**Inbound Rules**:
- HTTP (80) from 0.0.0.0/0
- HTTPS (443) from 0.0.0.0/0

**Outbound Rules**:
- All traffic to 0.0.0.0/0 (required for external API calls)

## Step 7: Set Environment Variables

Set all required environment variables for your application:

```bash
cd /path/to/server

# Set environment variables
eb setenv \
  MODEL="bedrock/us.meta.llama4-maverick-17b-instruct-v1:0" \
  EMBEDDING_MODEL="amazon.titan-embed-text-v2:0" \
  QDRANT_URL="https://your-cluster.qdrant.io" \
  QDRANT_API_KEY="your-qdrant-key" \
  JWT_SECRET_KEY="your-super-secret-jwt-key" \
  AWS_REGION="us-west-2" \
  "PRACTICE_uropmsandbox460=fhir_WpKHZ,uropmsandbox460,83529f51-4952-4749-8fb9-31c2170cdf0b"
```

**Environment Variable Format**:
- `PRACTICE_<firm_name>=<username>,<firm_name>,<api_key>`
- Example: `PRACTICE_uropmsandbox460=fhir_WpKHZ,uropmsandbox460,83529f51-4952-4749-8fb9-31c2170cdf0b`

> **Important**: Environment variables must be set using `eb setenv`, not just in local `.env` files. Elastic Beanstalk doesn't automatically load `.env` files.

## Step 8: Verify Deployment

```bash
# Check status
eb status  # Should show: Status: Ready, Health: Green

# Test health endpoint
curl https://api.uroassist.net/health
# Expected: {"status":"healthy","service":"UroAssist-backend"}

# Test authentication with ModMed
curl -X POST https://api.uroassist.net/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "practice_id": "PRACTICE_uropmsandbox460",
    "username": "fhir_WpKHZ",
    "password": "Urd6RwiU3c"
  }'
# Expected: {"success":true,"session_token":"...","username":"fhir_WpKHZ",...}
```

## Step 9: Test ModMed API Directly (Optional)

Verify ModMed API credentials are working:

```bash
curl --request POST \
     --url https://stage.ema-api.com/ema-dev/firm/uropmsandbox460/ema/ws/oauth2/grant \
     --header 'accept: application/json' \
     --header 'content-type: application/x-www-form-urlencoded' \
     --header 'x-api-key: 83529f51-4952-4749-8fb9-31c2170cdf0b' \
     --data grant_type=password \
     --data username=fhir_WpKHZ \
     --data password=Urd6RwiU3c
# Expected: {"scope":"uropmsandbox460","token_type":"Bearer","access_token":"..."}
```

## Common Commands

```bash
eb deploy              # Deploy updates
eb logs                # View logs
eb status              # Check environment status
eb setenv KEY=value    # Update environment variables
eb ssh                 # SSH into instance
```

## Troubleshooting

**Deployment fails - "No space left on device"**:
- Ensure `.ebextensions/04-disk-size.config` sets `RootVolumeSize: 20`
- Ensure Dockerfile includes `rm -rf /root/.cache/uv`

**HTTPS connection timeout**:
- ⚠️ **Most common issue**: Load Balancer security group missing IPv4 rule for port 443
- Check security group has HTTPS (443) from 0.0.0.0/0 (not just IPv6)
- Use the CLI command in Step 6 to add the rule
- Verify HTTPS listener is configured (Step 5)
- Check certificate is in us-west-2 and attached to listener
- Verify DNS propagation: `nslookup api.uroassist.net`

**ModMed authentication fails - "Invalid ModMed credentials"**:
- Check environment variable format: `PRACTICE_<firm>=<username>,<firm>,<api_key>`
- Verify the second field is the **firm name**, not the password
- Test ModMed API directly (Step 9) to verify credentials
- Check logs: `eb logs --all`

**"practice URL parsing bug"**:
- Ensure environment variable format: `username,firm_name,api_key`
- The firm name should match the URL segment in ModMed API endpoint

**Can't connect to external APIs (ModMed, Qdrant, Bedrock)**:
- Ensure `.ebextensions/03-vpc-network.config` sets `AssociatePublicIpAddress: true`
- Check EC2 security group allows outbound traffic (all traffic to 0.0.0.0/0)

**Health check failing**:
```bash
eb logs --all  # Check for errors
eb ssh         # SSH and check: curl localhost:8080/health
```

**CORS errors from frontend**:
- Verify frontend domain in `allowed_origins` in `app/main.py`
- Ensure `ENVIRONMENT=production` is set
- Redeploy: `eb deploy`

**"Listener already exists" error**:
- This is why we configure HTTPS listener manually (Step 5)
- Don't include listener config in `.ebextensions/`

## Cost Estimate

- EC2 t3.small: ~$14/month
- Load Balancer: ~$22/month  
- EBS 20GB: ~$2/month
- Domain: ~$17/year
- **Total: ~$40-50/month**

## Summary

**Production URL**: https://api.uroassist.net

**Key Features**:
- ✅ HTTPS with free SSL certificate (auto-renewing)
- ✅ Custom domain via Route 53
- ✅ Auto-scaling and load balancing
- ✅ Zero-downtime deployments
- ✅ Secure outbound access to external APIs
- ✅ Infrastructure as Code (version controlled config)

**Deployed Services**:
- FastAPI backend on Docker
- AWS Bedrock (LLMs)
- Qdrant Cloud (Vector DB)
- ModMed API integration