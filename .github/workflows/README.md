# GitHub Actions Workflows

This directory contains GitHub Actions workflows for deploying the StoryWriter frontend application.

## Workflows

### 1. Deploy Frontend (`deploy-frontend.yml`)

Main deployment workflow that handles both staging and production deployments.

**Triggers:**
- Push of a `v*` tag → Production deployment
- Push to `main` branch → Staging deployment
- Manual trigger → Choose environment (staging/production)

**Features:**
- Environment-specific builds with proper API_BASE_URL
- Comprehensive testing (TypeScript, linting, unit tests)
- Build validation and artifact management
- Backend connectivity testing
- S3 deployment with optimized caching
- CloudFront invalidation with completion waiting
- Deployment verification
- Automatic backup creation before deployment
- Rollback capability on failure

### 2. Rollback Frontend (`rollback-frontend.yml`)

Manual rollback workflow for emergency situations.

**Features:**
- Manual environment selection (staging/production)
- Optional specific backup timestamp selection
- Pre-rollback backup creation
- CloudFront invalidation
- Deployment verification
- Automatic cleanup of old backups

## Required GitHub Secrets

Set these secrets in your GitHub repository settings:

### AWS Credentials
```
AWS_ACCESS_KEY_ID       # AWS access key for S3/CloudFront access
AWS_SECRET_ACCESS_KEY   # AWS secret key
```

### CloudFront Distribution IDs
```
STAGING_CLOUDFRONT_ID   # CloudFront distribution ID for staging
PROD_CLOUDFRONT_ID      # CloudFront distribution ID for production
```

## Required AWS Resources

### S3 Buckets
- `storywriter-staging-frontend` - Staging frontend hosting
- `storywriter-prod-frontend` - Production frontend hosting

Both buckets should be configured for static website hosting.

### CloudFront Distributions
- Staging distribution pointing to staging S3 bucket
- Production distribution pointing to production S3 bucket

### Domains
- `staging.storywriter.net` - Staging domain
- `storywriter.net` - Production domain

Both should point to their respective CloudFront distributions.

## Environment Configuration

### Staging Environment
- API Base URL: `https://staging-api.storywriter.net`
- S3 Bucket: `storywriter-staging-frontend`
- Domain: `staging.storywriter.net`

### Production Environment  
- API Base URL: `https://api.storywriter.net`
- S3 Bucket: `storywriter-prod-frontend`
- Domain: `storywriter.net`

## Usage

### Automatic Deployments
- Push to `main` branch for staging deployment
- Push a `v*` tag (e.g. `v1.0.0`) for production deployment

### Manual Deployments
1. Go to Actions tab in GitHub
2. Select "Deploy Frontend" workflow
3. Click "Run workflow"
4. Choose environment (staging/production)
5. Click "Run workflow"

### Rollback
1. Go to Actions tab in GitHub
2. Select "Rollback Frontend Deployment" workflow
3. Click "Run workflow"
4. Choose environment to rollback
5. Optionally specify backup timestamp (leaves empty for latest)
6. Click "Run workflow"

## Build Process

1. **Setup** - Determines environment and configuration
2. **Test** - Runs TypeScript checking, linting, and unit tests
3. **Build** - Creates environment-specific build with correct API_BASE_URL
4. **Connectivity Test** - Verifies backend is accessible
5. **Deploy** - Uploads to S3 with backup creation
6. **CloudFront** - Invalidates distribution and waits for completion
7. **Verify** - Tests deployment accessibility

## Backup Strategy

- Automatic backup before each deployment
- Backups stored in `backups/{environment}/{timestamp}/` in S3
- Automatic cleanup keeps last 10 backups per environment
- Pre-rollback backup created during rollback operations

## Monitoring

The workflow provides detailed logging for:
- Build validation
- Backend connectivity tests
- S3 synchronization
- CloudFront invalidation progress
- Deployment verification
- Rollback operations

## Troubleshooting

### Common Issues

1. **Backend connectivity test fails**
   - Workflow continues with warning
   - Check backend API health endpoint
   - Verify API_BASE_URL configuration

2. **S3 deployment fails**
   - Check AWS credentials and permissions
   - Verify S3 bucket exists and is accessible
   - Check bucket policy for proper permissions

3. **CloudFront invalidation timeout**
   - May indicate CloudFront distribution issues
   - Check distribution status in AWS console
   - Verify distribution ID in secrets

4. **Deployment verification fails**
   - Allow more time for DNS propagation
   - Check domain DNS configuration
   - Verify CloudFront distribution settings

### Emergency Procedures

1. **Immediate rollback needed**
   - Use rollback workflow with latest backup
   - Monitor verification steps

2. **Partial deployment**
   - Re-run deployment workflow
   - S3 sync will update only changed files

3. **Backend is down**
   - Frontend deployment can continue
   - Backend connectivity test will warn but not fail
   - Update backend separately

## Performance Optimizations

- **Caching Strategy**
  - Static assets: 1 year cache with versioning
  - HTML files: No cache to ensure updates
- **Parallel Processing**
  - Tests and builds run in parallel where possible
- **Artifact Management**
  - Build artifacts cached between jobs
  - 7-day retention for debugging