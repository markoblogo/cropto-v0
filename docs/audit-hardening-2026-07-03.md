# Cropto Audit and Hardening Report - 2026-07-03

## Scope

This pass covered the current Cropto repository on `release/demo`:

- Express API, auth and operational job routes;
- public site/deck positioning and status text;
- Sea Brokerage Monitor route guards;
- dependency audit surface;
- deployment/runbook documentation.

## Fixed

- Removed an unintended debug beacon from `authenticateToken`.
- Added baseline API security headers.
- Added process-local rate limits for API, auth and upload routes.
- Hardened uploaded feedback image serving with dotfile denial, cache control and strict static-file headers.
- Restricted production operational job endpoints with `JOB_RUNNER_SECRET`.
- Prevented public registration from assigning `BROKER`, `ADMIN` or `SUPER_ADMIN`.
- Prevented self-service role update from assigning operator roles.
- Restricted `GET /api/wallet/:userId` to the user themself or an admin/broker operator.
- Removed duplicate `registerSpotRoutes` startup registration.
- Updated homepage status copy to mention the current hardening baseline and Polygon Amoy.
- Updated `.env.example`, README and deploy runbook with hardening requirements.

## Verification

Run before merging/deploying:

```bash
npm run check
npm run i18n:check
npm run build
npm audit --omit=dev
```

## Residual Risks

`npm audit --omit=dev` still reports issues that need migration decisions:

- `drizzle-orm <0.45.2`: high-severity SQL identifier escaping advisory; available fix is a major-version upgrade.
- `nodemailer <=9.0.0`: high-severity advisory; upgrade should be tested against email mock/live mail paths.
- Hardhat/toolbox transitive packages: mostly dev/on-chain toolchain risk; upgrade path is major-version and should be tested against contract deploy scripts.
- `xlsx`: no upstream fix is available in the current package line; replace with a maintained parser or isolate file parsing to trusted/offline flows.

## Follow-Up Recommendations

- Add CI jobs for `npm run check`, `npm run i18n:check`, `npm run build` and a documented `npm audit --omit=dev` threshold.
- Split `server/routes.ts` into route modules by domain to reduce review and regression risk.
- Move long-running ingestion/scraper/browser work to the jobs service only.
- Add integration tests for auth registration, role update, job secret rejection and wallet lookup authorization.
- Plan explicit migrations for `drizzle-orm`, `nodemailer`, Hardhat 3/toolbox and `xlsx` replacement.
