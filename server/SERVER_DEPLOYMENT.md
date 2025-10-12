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
# Select: us-west-2, Docker platform, application name

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

## Step 5: Configure Security Groups

### Load Balancer Security Group

Find: **EC2 → Load Balancers → Select your LB → Security tab**

**Inbound Rules**:
- HTTP (80) from 0.0.0.0/0
- HTTPS (443) from 0.0.0.0/0
- HTTPS (443) from ::/0

**Outbound Rules**:
- All traffic to 0.0.0.0/0

### EC2 Instance Security Group

Find: **EC2 → Security Groups** (search for `AWSEBSecurityGroup`)

**Inbound Rules**:
- HTTP (80) from 0.0.0.0/0
- HTTPS (443) from 0.0.0.0/0

**Outbound Rules**:
- All traffic to 0.0.0.0/0 (required for external API calls)

## Step 6: Verify Deployment

```bash
# Check status
eb status  # Should show: Status: Ready, Health: Green

# Test health endpoint
curl https://api.uroassist.net/health
# Expected: {"status":"healthy","service":"UroAssist-backend"}

# Test authentication
curl -X POST https://api.uroassist.net/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"test"}'
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
- Ensure `.ebextensions/03-disk-size.config` sets `RootVolumeSize: 20`
- Ensure Dockerfile includes `rm -rf /root/.cache/uv`

**HTTPS not working**:
- Verify security groups allow port 443
- Check certificate is in us-west-2
- Verify DNS propagation: `nslookup api.uroassist.net`

**Can't connect to external APIs**:
- Ensure `.ebextensions/03-vpc-network.config` sets `AssociatePublicIpAddress: true`
- Check EC2 security group allows outbound traffic

**Health check failing**:
```bash
eb logs --all  # Check for errors
eb ssh         # SSH and check: curl localhost:8080/health
```

**CORS errors**:
- Verify frontend domain in `allowed_origins`
- Redeploy: `eb deploy`

**"Listener already exists" error**:
- Delete HTTPS listener from EC2 → Load Balancers → Listeners tab
- Then deploy again

## Cost Estimate

- EC2 t3.small: ~$15/month
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