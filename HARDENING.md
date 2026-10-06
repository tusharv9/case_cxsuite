# Phase 8: performance, hardening, refactor

## Backend
- **Errors**: `ExceptionMiddleware` maps exception types to 400/401/404/409/500 JSON bodies carrying a `correlationId` (also logged and returned in the `X-Correlation-Id` header). Internals are never leaked on 500.
- **Security headers / hosts**: `HardeningMiddleware` adds nosniff, frame, referrer and permissions headers. Set `AllowedHosts` in production.
- **CORS**: explicit origins only (`AllowedOrigins`); wildcard sub-domain patterns are opt-in via `Security:AllowedOriginPatterns` (one `*` max). No credentialed CORS. `*.vercel.app` is no longer allowed by default.
- **Rate limiting**: per-caller limits, a stricter `uploads` policy on attachment uploads.
- **Lists are always paged** (`/api/cases`, notifications) with a server-side page-size cap.
- **Logging**: request logging; JSON console logs outside Development.
- **Startup checks** (`StartupChecks`) fail fast on unsafe configuration.
- **Refactor**: `CaseService` split into `CaseCollaborationService` and `MentionService`.
- **Performance**: persisted `SlaOutcome`, open-case partial indexes, dashboard aggregates in SQL, response compression.

## Frontend
- Shared one-second ticker (`useNow`, `useSyncExternalStore`) instead of a timer per component.
- `ErrorBoundary` at app and route level; data router with an unsaved-changes guard (`useBlocker`) on the SLA settings page and dirty prompts in drawers (shared `SideDrawer`).
- API client retries safe requests and shows friendly errors; the users list request is de-duplicated.
- Dead code removed from services/utils.

## Deploy checklist
Set `AllowedOrigins` / `Security:AllowedOriginPatterns`, `AllowedHosts`, `Attachments:StoragePath`; back up the DB before the first start (two migrations).
