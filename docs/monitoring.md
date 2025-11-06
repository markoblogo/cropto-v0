# Monitoring & CI/CD Setup

This document describes the monitoring and continuous integration setup for Cropto.

## Continuous Integration

The project uses GitHub Actions for automated testing and health checks.

### CI Workflow

Location: `.github/workflows/ci.yml`

The CI pipeline runs on every push and pull request:

1. **Test Suite**: Runs all Jest tests with coverage
2. **Build**: Compiles the application
3. **Health Check**: Starts the server and verifies `/api/health` endpoint

#### Running Locally

```bash
# Run tests
npm test

# Run tests with coverage
npx jest --coverage

# Check application health
curl http://localhost:5000/api/health
```

### Environment Variables for CI

The following secrets are required in GitHub Actions:

- `DATABASE_URL`: PostgreSQL connection string
- `JWT_SECRET`: Secret key for JWT token signing

## Error Monitoring with Sentry

Cropto includes minimal Sentry integration for production error tracking.

### Setup Instructions

1. **Install Sentry packages** (currently disabled due to peer dependency conflicts):
   ```bash
   npm install --legacy-peer-deps @sentry/node @sentry/profiling-node
   ```

2. **Get Sentry DSN**:
   - Sign up at [sentry.io](https://sentry.io)
   - Create a new Node.js project
   - Copy your DSN from Project Settings

3. **Configure Environment**:
   Add `SENTRY_DSN` to your Replit Secrets:
   ```
   SENTRY_DSN=https://your-dsn@sentry.io/project-id
   ```

4. **Enable Sentry Integration**:
   Edit `server/utils/sentry.ts` and uncomment the Sentry initialization code.

### Features

When enabled, Sentry provides:

- **Error Tracking**: Automatic capture of uncaught exceptions
- **Performance Monitoring**: Track request performance
- **Profiling**: CPU and memory profiling
- **Custom Events**: Manual error and message logging

### Usage

```typescript
import { captureException, captureMessage } from './utils/sentry';

// Capture errors
try {
  // your code
} catch (error) {
  captureException(error, { userId: user.id });
}

// Log messages
captureMessage('Important event occurred', 'info');
```

## Health Checks

The application exposes a health check endpoint:

```
GET /api/health
```

Response:
```json
{
  "ok": true
}
```

This endpoint is used by:
- CI/CD pipeline to verify deployment
- Load balancers for health monitoring
- Uptime monitoring services

## Logs

### Application Logs

- API requests are logged with duration and status
- Error logs include stack traces
- Startup logs show initialization status

### Email Logs (Test Environment)

Email notifications are logged to `logs/email-log-*.log` files in the test environment.

## Production Monitoring Checklist

Before going to production:

- [ ] Enable Sentry error tracking
- [ ] Set up uptime monitoring (e.g., UptimeRobot, Pingdom)
- [ ] Configure log aggregation (e.g., Papertrail, Loggly)
- [ ] Set up performance monitoring
- [ ] Enable database backup monitoring
- [ ] Configure alerting for critical errors

## Performance Metrics

Monitor these key metrics:

- API response times
- Database query performance
- Error rates
- Transaction processing times
- Margin call processing duration
- Blockchain transaction confirmation times

## Support

For issues with monitoring setup:
1. Check Sentry documentation
2. Verify environment variables are set
3. Review application logs
4. Contact the development team
