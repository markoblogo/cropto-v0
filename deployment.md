# Cropto Deployment Guide

## Overview

This guide covers deploying Cropto to production environments. The application is designed to run on Replit's infrastructure but can be deployed to any platform supporting Node.js and PostgreSQL.

## Prerequisites

### Required Services
- **Node.js**: Version 20.x or higher
- **PostgreSQL**: Version 14+ or Neon Serverless PostgreSQL
- **Environment Variables**: Properly configured secrets

### Environment Variables

Create a `.env` file (or configure in your hosting platform):

```env
# Database
DATABASE_URL=postgresql://user:password@host:port/database
PGHOST=your-postgres-host
PGPORT=5432
PGUSER=your-postgres-user
PGPASSWORD=your-postgres-password
PGDATABASE=your-database-name

# Session Management
SESSION_SECRET=your-secure-random-string-here

# Node Environment
NODE_ENV=production
```

**Generate a secure session secret**:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Deployment Methods

### Method 1: Replit (Recommended)

Cropto is optimized for Replit's deployment system:

1. **Prepare for Publishing**:
   - Ensure all environment secrets are set in Replit Secrets
   - Database should be configured and migrated
   - Test thoroughly in development mode

2. **Publish via Replit**:
   - Click the "Publish" button in the Replit interface
   - Replit handles:
     - Building the application
     - TLS/HTTPS configuration
     - Domain management (.replit.app or custom domain)
     - Health checks and auto-restart

3. **Post-Deployment**:
   - Verify health endpoint: `https://your-app.replit.app/api/health`
   - Test option creation and matching flows
   - Monitor logs for any errors

### Method 2: Manual Deployment (VPS/Cloud)

#### Step 1: Set Up PostgreSQL

**Option A: Neon Serverless** (Recommended):
```bash
# Create a Neon project at https://neon.tech
# Copy the connection string
export DATABASE_URL="postgresql://user:pass@host/db?sslmode=require"
```

**Option B: Self-Hosted PostgreSQL**:
```bash
# Install PostgreSQL
sudo apt-get update
sudo apt-get install postgresql postgresql-contrib

# Create database
sudo -u postgres createdb cropto
sudo -u postgres createuser cropto_user

# Set password and grant permissions
sudo -u postgres psql
ALTER USER cropto_user WITH PASSWORD 'secure_password';
GRANT ALL PRIVILEGES ON DATABASE cropto TO cropto_user;
```

#### Step 2: Clone and Install

```bash
# Clone repository
git clone <your-repo-url>
cd cropto

# Install dependencies
npm install

# Set environment variables
cp .env.example .env
# Edit .env with your configuration
```

#### Step 3: Database Migration

```bash
# Push schema to database
npm run db:push

# Verify tables were created
npm run db:studio
# This opens Drizzle Studio to inspect your database
```

#### Step 4: Build Application

```bash
# Build for production
npm run build

# This compiles:
# - Frontend: Vite builds client to client/dist
# - Backend: ESBuild compiles server to dist/index.js
```

#### Step 5: Start Production Server

```bash
# Start the application
npm start

# Or use a process manager like PM2
npm install -g pm2
pm2 start npm --name "cropto" -- start
pm2 save
pm2 startup
```

#### Step 6: Configure Reverse Proxy

**Nginx Configuration**:
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

**Enable HTTPS with Certbot**:
```bash
sudo apt-get install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

### Method 3: Docker Deployment

#### Dockerfile

```dockerfile
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application files
COPY . .

# Build application
RUN npm run build

# Expose port
EXPOSE 5000

# Set environment to production
ENV NODE_ENV=production

# Start application
CMD ["npm", "start"]
```

#### docker-compose.yml

```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "5000:5000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=${DATABASE_URL}
      - SESSION_SECRET=${SESSION_SECRET}
    depends_on:
      - postgres
    restart: unless-stopped

  postgres:
    image: postgres:14-alpine
    environment:
      - POSTGRES_DB=cropto
      - POSTGRES_USER=cropto_user
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

volumes:
  postgres_data:
```

**Deploy with Docker Compose**:
```bash
docker-compose up -d
```

## Database Management

### Migrations

Cropto uses Drizzle ORM with schema-first development:

```bash
# Push schema changes to database
npm run db:push

# For major schema changes, use force flag
npm run db:push --force

# Open database studio to inspect data
npm run db:studio
```

### Backup and Restore

**Backup Database**:
```bash
pg_dump -h $PGHOST -U $PGUSER -d $PGDATABASE > backup.sql
```

**Restore Database**:
```bash
psql -h $PGHOST -U $PGUSER -d $PGDATABASE < backup.sql
```

## Monitoring

### Health Checks

```bash
# Check application health
curl https://your-domain.com/api/health

# Expected response:
{"status":"ok"}
```

### Logs

**Development**:
```bash
npm run dev
# Logs appear in console
```

**Production (PM2)**:
```bash
pm2 logs cropto
pm2 monit
```

**Docker**:
```bash
docker-compose logs -f app
```

### Performance Monitoring

Recommended tools:
- **New Relic**: Application performance monitoring
- **Sentry**: Error tracking and reporting
- **Datadog**: Infrastructure and application monitoring
- **LogRocket**: Frontend error tracking

## Security Checklist

Before deploying to production:

- [ ] All secrets stored in environment variables (never in code)
- [ ] `SESSION_SECRET` is cryptographically random (32+ bytes)
- [ ] Database uses SSL/TLS connections
- [ ] HTTPS enabled with valid SSL certificate
- [ ] CORS configured for allowed origins only
- [ ] Rate limiting enabled on API endpoints
- [ ] Input validation on all forms
- [ ] Dependencies updated and audited (`npm audit`)
- [ ] Error messages don't expose sensitive information
- [ ] Database backups configured and tested
- [ ] Monitoring and alerting configured
- [ ] Security headers configured (CSP, HSTS, X-Frame-Options)

## Troubleshooting

### Common Issues

**Database Connection Errors**:
```
Error: connect ECONNREFUSED
```
- Verify DATABASE_URL is correct
- Check PostgreSQL is running
- Ensure firewall allows connections
- Verify SSL settings match database requirements

**Port Already in Use**:
```
Error: listen EADDRINUSE: address already in use :::5000
```
- Change PORT environment variable
- Kill process using port 5000: `lsof -ti:5000 | xargs kill -9`

**Build Failures**:
- Clear node_modules: `rm -rf node_modules && npm install`
- Clear build cache: `rm -rf client/dist dist`
- Verify Node.js version: `node --version` (should be 20+)

**Session Issues**:
- Ensure SESSION_SECRET is set
- Check session store configuration
- Verify cookie settings for your domain

## Scaling Considerations

### Horizontal Scaling

To run multiple instances:

1. **Use a session store** (instead of in-memory):
   - Redis
   - PostgreSQL session store
   - Memcached

2. **Configure load balancer**:
   - Nginx
   - HAProxy
   - Cloud provider load balancer

3. **Enable sticky sessions** if using in-memory sessions

### Database Scaling

- **Connection pooling**: Already configured via Neon driver
- **Read replicas**: For high read volume
- **Partitioning**: For large tables (options, trades)
- **Indexing**: Add indexes on frequently queried columns

### Caching

Consider adding:
- **Redis**: For session storage and caching
- **CDN**: For static assets (Cloudflare, AWS CloudFront)
- **Application-level caching**: TanStack Query on frontend

## Rollback Procedure

If deployment issues occur:

1. **Revert code**:
   ```bash
   git revert <commit-hash>
   git push
   ```

2. **Restore database** (if schema changed):
   ```bash
   psql -h $PGHOST -U $PGUSER -d $PGDATABASE < backup.sql
   ```

3. **Restart application**:
   ```bash
   pm2 restart cropto
   # or
   docker-compose restart app
   ```

## Production Optimization

### Environment-Specific Settings

```javascript
// In production
if (process.env.NODE_ENV === 'production') {
  // Disable verbose logging
  // Enable compression
  // Set secure cookie settings
  // Enable rate limiting
}
```

### Performance Tips

1. **Enable gzip compression**
2. **Set proper cache headers**
3. **Optimize database queries**
4. **Use CDN for static assets**
5. **Implement request throttling**
6. **Monitor and optimize bundle size**

---

**Last Updated**: November 4, 2025
**Version**: 1.0.0
