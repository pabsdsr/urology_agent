# Frontend Deployment Guide - AWS S3 + CloudFront

## Overview

React frontend deployed on AWS S3 with CloudFront CDN for global distribution and HTTPS support.

- **URL**: https://uroassist.net
- **Hosting**: AWS S3 (static website)
- **CDN**: AWS CloudFront
- **SSL**: AWS Certificate Manager (same cert as backend)
- **Build Tool**: Vite

## Architecture

```
User Browser
    ↓
CloudFront CDN (HTTPS)
    ↓
S3 Bucket (Static Files)
    ↓
Backend API (api.uroassist.net)
```

## Prerequisites

```bash
# Install AWS CLI (if not already installed)
# Already installed from backend deployment
aws configure  # Should already be configured
```

**AWS Resources Needed**:
- S3 bucket for hosting
- CloudFront distribution
- SSL certificate (already have from backend)
- Route 53 A record

## Step 1: Build Frontend for Production

### Update Environment Configuration

Ensure `.env.production` is correct:

```bash
# File: client/.env.production
VITE_API_URL=https://api.uroassist.net
```

### Build the Application

```bash
cd /Users/wesleykim/Projects/urology_agent/client

# Install dependencies (if not already installed)
npm install

# Build for production
npm run build
```

This creates an optimized production build in `client/dist/` with:
- Minified JavaScript
- Optimized CSS
- Hashed filenames for cache busting
- index.html entry point

### Verify Build

```bash
# Check build output
ls -la dist/

# Expected structure:
# dist/
#   ├── index.html
#   ├── assets/
#   │   ├── index-[hash].js
#   │   └── index-[hash].css
#   └── vite.svg
```

## Step 2: Create S3 Bucket

### Create Bucket

```bash
# Create S3 bucket (must be globally unique name)
aws s3 mb s3://uroassist-frontend --region us-west-2
```

**Important**: Bucket name doesn't need to match domain when using CloudFront.

### Configure Bucket for Static Website Hosting

```bash
# Enable static website hosting
aws s3 website s3://uroassist-frontend \
  --index-document index.html \
  --error-document index.html
```

**Note**: `error-document` set to `index.html` for client-side routing (React Router).

### Set Bucket Policy

Create a bucket policy to allow CloudFront access:

```bash
# Create policy file
cat > /tmp/s3-policy.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::uroassist-frontend/*"
    }
  ]
}
EOF

# Apply policy
aws s3api put-bucket-policy \
  --bucket uroassist-frontend \
  --policy file:///tmp/s3-policy.json
```

### Disable Block Public Access

```bash
# Allow public access (needed for CloudFront)
aws s3api put-public-access-block \
  --bucket uroassist-frontend \
  --public-access-block-configuration \
    "BlockPublicAcls=false,IgnorePublicAcls=false,BlockPublicPolicy=false,RestrictPublicBuckets=false"
```

## Step 3: Upload Build to S3

### Initial Upload

```bash
cd /Users/wesleykim/Projects/urology_agent/client

# Upload all files
aws s3 sync dist/ s3://uroassist-frontend/ \
  --delete \
  --cache-control "public, max-age=31536000" \
  --exclude "index.html"

# Upload index.html with no-cache (for immediate updates)
aws s3 cp dist/index.html s3://uroassist-frontend/ \
  --cache-control "no-cache, no-store, must-revalidate"
```

**Cache Strategy**:
- **Assets** (JS, CSS): 1 year cache (immutable with hash in filename)
- **index.html**: No cache (always fetch latest)

### Verify Upload

```bash
# List uploaded files
aws s3 ls s3://uroassist-frontend/ --recursive

# Test direct S3 access
curl http://uroassist-frontend.s3-website-us-west-2.amazonaws.com
```

## Step 4: Create CloudFront Distribution

### Create Distribution via AWS Console

1. **Go to CloudFront** in AWS Console
2. **Click "Create distribution"**

### **Distribution Options**

- **Distribution name**: `uroassist-frontend-s3` (auto-filled)
- **Description**: Leave empty
- **Distribution type**: Select "Single website or app"

### **Custom Domain Configuration**

- **Domain**: Enter `uroassist.net` (or both `uroassist.net, www.uroassist.net` if you want www)
- Click **"Check domain"** to verify Route 53 has your hosted zone
- Click **"Next"**

### **Origin Configuration**

1. **Origin domain**: 
   - Click the dropdown
   - Select **`uroassist-frontend`** (your S3 bucket)
   - ⚠️ **Important**: You'll see a yellow warning: "S3 bucket is not configured as a website endpoint"
   - Click the **"Use website endpoint"** button in the warning
   - Origin should change to: `uroassist-frontend.s3-website-us-west-2.amazonaws.com`

2. **Origin path**: Leave blank (delete any `/path` placeholder)

3. **Name**: Auto-filled (e.g., `uroassist-frontend.s3-website-us-west-2.amazonaws.com`)

4. **Origin access**: Select **"Public"** (we set up bucket policy for public reads)

5. **Enable Origin Shield**: **No** (not needed, adds cost)

### **Settings Configuration**

**Origin settings**: 
- ✅ Keep "Use recommended origin settings" selected

**Cache settings**: 
- ✅ Keep "Use recommended cache settings tailored to serving S3 content" selected

**Web Application Firewall (WAF)**: 
- ✅ Select "Do not enable security protections" (can enable later if needed, adds ~$14/month)

### **SSL Certificate Configuration**

⚠️ **Important**: CloudFront requires certificates in **us-east-1**, even though your other resources are in us-west-2.

1. **SSL certificate**: 
   - You'll see: "No custom certificate in us-east-1 found"
   - Click **"Create certificate"** button
   - Check **"Create a wildcard certificate"** (recommended)
   - Click **"Create certificate"**

2. **Certificate Creation**:
   - Certificate will be created for:
     - `uroassist.net`
     - `*.uroassist.net` (wildcard, includes www.uroassist.net)
   - Region: us-east-1 (correct for CloudFront)
   - DNS validation via Route 53 (automatic)
   - Certificate ARN: `arn:aws:acm:us-east-1:801429475253:certificate/a9358394-bbae-4823-a410-6ea511987493`

3. **Verification**:
   - ✅ Certificate should be selected (blue radio button)
   - ✅ Status will show "Pending validation" initially, then "Issued" after 5-10 minutes

4. Click **"Create distribution"**

### **Wait for Deployment**

- Distribution deployment takes 10-15 minutes
- Status will change from "Deploying" → "Enabled"
- You'll get a CloudFront domain name like: `d1234567890abc.cloudfront.net`

### **Note on Certificates**

You now have **two certificates** (this is normal and correct):

| Certificate | Region | Used For | ARN |
|------------|--------|----------|-----|
| Backend | us-west-2 | Elastic Beanstalk (api.uroassist.net) | `arn:aws:acm:us-west-2:801429475253:certificate/76209017-3d1d-48b9-81aa-6829527dcd54` |
| Frontend | us-east-1 | CloudFront (uroassist.net) | `arn:aws:acm:us-east-1:801429475253:certificate/a9358394-bbae-4823-a410-6ea511987493` |

**Why two certificates?**
- Elastic Beanstalk requires certificates in the same region as the load balancer (us-west-2)
- CloudFront is a global service and **always** requires certificates in us-east-1
- Both certificates cover `*.uroassist.net` so all subdomains are secured

### Get CloudFront Distribution Domain

After creation, note the **Distribution Domain Name**:
- Example: `d1234567890abc.cloudfront.net`

### **Configure Custom Error Responses (Critical for React Router)**

After the distribution is created and deployed (status = "Enabled"), you must configure error pages:

1. **Go to CloudFront → Distributions**
2. **Click on your distribution** (`uroassist-frontend-s3`)
3. **Go to the "Error pages" tab**
4. **Click "Create custom error response"**

**Configure for 404 errors:**
- **HTTP error code**: 404
- **Customize error response**: Yes
- **Response page path**: `/index.html`
- **HTTP response code**: 200
- Click **"Create custom error response"**

**Configure for 403 errors:**
- Click **"Create custom error response"** again
- **HTTP error code**: 403
- **Customize error response**: Yes
- **Response page path**: `/index.html`
- **HTTP response code**: 200
- Click **"Create custom error response"**

**Why this is critical:**
- Without these error pages, React Router breaks
- Refreshing pages returns 404 errors
- Direct URL access to routes fails
- With error pages: All routes work, page refresh works, direct URL access works

## Step 5: Configure DNS

### Create A Record for Root Domain

1. **Route 53 → Hosted Zones → uroassist.net**
2. **Create Record**: (need to make 2)
   - **Record name**: Leave empty (for root domain) / www
   - **Record type**: A (Alias)
   - **Route traffic to**: Alias to CloudFront distribution
   - **Distribution**: Select your CloudFront distribution
   - **Evaluate Target Health**: No

3. **Create Record**

### Verify DNS

```bash
# Check DNS resolution
nslookup uroassist.net

# Should point to CloudFront IPs
dig uroassist.net
```

Wait 5-10 minutes for DNS propagation.

## Step 6: Verify Deployment

### Test HTTPS Access

```bash
# Test root domain
curl -I https://uroassist.net

# Should return 200 OK with CloudFront headers
```

### Test in Browser

1. Open `https://uroassist.net`
2. Should see login page
3. Check that assets load over HTTPS
4. Test login functionality

### Test Client-Side Routing

1. Navigate to different routes in the app
2. Refresh the page (should not get 404)
3. Direct URL access should work

## Deployment Script

Create a deployment script for easy updates:

```bash
# File: client/deploy.sh
#!/bin/bash

set -e

echo "Building frontend..."
npm run build

echo "Uploading to S3..."
aws s3 sync dist/ s3://uroassist-frontend/ \
  --delete \
  --cache-control "public, max-age=31536000" \
  --exclude "index.html"

aws s3 cp dist/index.html s3://uroassist-frontend/ \
  --cache-control "no-cache, no-store, must-revalidate"

echo "Invalidating CloudFront cache..."
aws cloudfront create-invalidation \
  --distribution-id YOUR_DISTRIBUTION_ID \
  --paths "/*"

echo "Deployment complete!"
echo "Frontend: https://uroassist.net"
```

Make it executable:
```bash
chmod +x deploy.sh
```

## Common Commands

```bash
# Build
npm run build

# Deploy (full update)
./deploy.sh

# Quick upload (without invalidation)
aws s3 sync dist/ s3://uroassist-frontend/ --delete

# Invalidate CloudFront cache
aws cloudfront create-invalidation \
  --distribution-id YOUR_DISTRIBUTION_ID \
  --paths "/*"

# Check CloudFront distribution status
aws cloudfront get-distribution --id YOUR_DISTRIBUTION_ID

# View CloudFront logs
aws s3 ls s3://uroassist-frontend-logs/
```

## Troubleshooting

### **404 on page refresh**
- **Problem**: CloudFront returns 404 when refreshing React routes
- **Solution**: Configure custom error responses (403/404 → /index.html with 200)

### **Old cached content showing**
- **Problem**: CloudFront serving cached files after deployment
- **Solution**: Create cache invalidation:
  ```bash
  aws cloudfront create-invalidation \
    --distribution-id YOUR_DISTRIBUTION_ID \
    --paths "/*"
  ```

### **SSL certificate error**
- **Problem**: Certificate doesn't match domain
- **Solution**: Ensure certificate includes both `uroassist.net` and `*.uroassist.net`

### **API calls failing (CORS)**
- **Problem**: Browser blocking requests to backend
- **Solution**: 
  1. Verify `.env.production` has correct `VITE_API_URL`
  2. Rebuild: `npm run build`
  3. Check backend CORS allows `https://uroassist.net`

### **Assets not loading**
- **Problem**: 404 for JS/CSS files
- **Solution**: 
  1. Check vite.config.js has correct `base` path (should be `/`)
  2. Verify S3 bucket has all files from `dist/`
  3. Check CloudFront origin settings

## Environment Variables

### Development
```bash
# client/.env.development
VITE_API_URL=http://localhost:8080
```

### Production
```bash
# client/.env.production
VITE_API_URL=https://api.uroassist.net
```

**Important**: Vite environment variables must be prefixed with `VITE_`.

## Cost Estimate

Monthly costs (approximate):
- **S3 Storage**: ~$0.50 (assuming 500MB)
- **S3 Requests**: ~$0.10 (1K requests/day)
- **CloudFront**: ~$1.00 (1GB transfer/month)
- **Total**: ~$2-5/month

**Note**: CloudFront has a free tier (1TB data transfer out, 10M HTTP/HTTPS requests per month for first 12 months).

## Security Considerations

### HTTPS Only
- CloudFront configured to redirect HTTP → HTTPS
- SSL/TLS 1.2+ enforced

### Content Security Policy (CSP)

Add CSP headers via CloudFront Functions (optional):

```javascript
// CloudFront Function for security headers
function handler(event) {
  var response = event.response;
  var headers = response.headers;
  
  headers['strict-transport-security'] = { value: 'max-age=31536000' };
  headers['x-content-type-options'] = { value: 'nosniff' };
  headers['x-frame-options'] = { value: 'DENY' };
  headers['x-xss-protection'] = { value: '1; mode=block' };
  
  return response;
}
```

### Origin Access Identity (OAI)

For enhanced security, restrict S3 access to CloudFront only:

1. Create CloudFront Origin Access Identity
2. Update S3 bucket policy to allow only OAI
3. Update CloudFront origin to use OAI

## CI/CD Pipeline (Optional)

### GitHub Actions Workflow

Create `.github/workflows/deploy-frontend.yml`:

```yaml
name: Deploy Frontend

on:
  push:
    branches: [main]
    paths:
      - 'client/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node
      uses: actions/setup-node@v3
      with:
        node-version: '18'
        
    - name: Install dependencies
      working-directory: ./client
      run: npm ci
      
    - name: Build
      working-directory: ./client
      run: npm run build
      
    - name: Configure AWS credentials
      uses: aws-actions/configure-aws-credentials@v2
      with:
        aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
        aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
        aws-region: us-west-2
        
    - name: Deploy to S3
      working-directory: ./client
      run: |
        aws s3 sync dist/ s3://uroassist-frontend/ \
          --delete \
          --cache-control "public, max-age=31536000" \
          --exclude "index.html"
        aws s3 cp dist/index.html s3://uroassist-frontend/ \
          --cache-control "no-cache, no-store, must-revalidate"
          
    - name: Invalidate CloudFront
      run: |
        aws cloudfront create-invalidation \
          --distribution-id ${{ secrets.CLOUDFRONT_DISTRIBUTION_ID }} \
          --paths "/*"
```

## Performance Optimization

### Build Optimization

Vite automatically:
- Minifies JavaScript
- Tree-shakes unused code
- Code-splits by route
- Optimizes images

### CloudFront Optimization

- **Enable Compression**: Gzip/Brotli for text files
- **Cache Strategy**: Long cache for assets, no cache for HTML
- **HTTP/2**: Enabled by default
- **IPv6**: Enabled by default

### React Optimization

- Lazy load routes with `React.lazy()`
- Use `React.memo()` for expensive components
- Optimize images (WebP format)
- Implement code splitting

## Monitoring

### CloudFront Metrics (CloudWatch)

- Requests
- Data transfer
- Error rates (4xx, 5xx)
- Cache hit ratio

### Enable CloudFront Logging

```bash
# Create logs bucket
aws s3 mb s3://uroassist-frontend-logs --region us-west-2

# Update CloudFront distribution to enable logging
aws cloudfront update-distribution \
  --id YOUR_DISTRIBUTION_ID \
  --logging-enabled true \
  --logging-bucket uroassist-frontend-logs.s3.amazonaws.com \
  --logging-prefix cloudfront/
```

## Summary

**Production URL**: https://uroassist.net

**Deployment Flow**:
1. Make changes to frontend code
2. Build: `npm run build`
3. Upload to S3: `aws s3 sync dist/ s3://uroassist-frontend/`
4. Invalidate CloudFront: `aws cloudfront create-invalidation`
5. Verify: Visit https://uroassist.net

**Key Features**:
- ✅ HTTPS with free SSL certificate
- ✅ Global CDN (low latency worldwide)
- ✅ Custom domain (uroassist.net)
- ✅ Client-side routing support
- ✅ Automatic cache management
- ✅ Cost-effective (~$2-5/month)

**Architecture**:
- Frontend: S3 + CloudFront
- Backend: Elastic Beanstalk (api.uroassist.net)
- Full-stack HTTPS deployment with custom domain

