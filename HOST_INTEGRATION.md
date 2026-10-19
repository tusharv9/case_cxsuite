# Case Management Remote — Host Integration Guide (v1, Phase 3)

Case Management is a **Module Federation Remote**. The **Host App owns login, tokens, users and roles**.
This Remote never authenticates anyone and has no user create/edit/delete: it consumes what the Host gives it.

## 1. Loading the Remote (unchanged from v0)
- Remote name `caseManagement`, entry `<remote-origin>/assets/remoteEntry.js`, exposed module `./mount`.
- Self-contained (own React + router, own React root): the Host's React/router versions don't matter.
```js
const { mount } = await import('caseManagement/mount');
const handle = mount(containerElement, {
  basename: '/cases',                                   // Host route is /cases/*
  getAccessToken: async () => hostSession.accessToken,   // called per request; return a FRESH token
  onUnauthorized: () => hostSession.refreshOrSignOut(),  // backend said 401
  apiBaseUrl: 'https://case-api.example.com',            // optional override
  currentUser, permissions, locale, timezone,            // informational; the backend is the source of truth
});
handle.update(newProps); handle.unmount();
```
**Passing `getAccessToken` is what switches the Remote into Host mode** on the client. Without it the Remote
runs as its own site and shows a sign-in screen (see §5).

## 2. What the backend expects (all of it configuration, section `HostIntegration`)
| Setting | Meaning |
|---|---|
| `Mode` | `Host` (Host tokens only), `Hybrid` (Host tokens, plus optionally the dev header — one backend for the Host and the standalone site), or `Standalone` (dev: header identity only). Standalone is refused outside Development unless `AllowStandaloneInProduction=true`. |
| `HybridAllowsDevHeader` | Hybrid only: callers that send **no** token may use the `X-User-Id` header (demo user picker). Not authentication: outside Development it also needs `AllowStandaloneInProduction=true`. A request with a token never falls back to it. |
| `Jwt:Authority` (or `MetadataAddress`) | Host's OIDC authority; signing keys come from its discovery document. |
| `Jwt:PublicKeyPem` | The Host's RSA public key (PEM) for a Host that signs RS256 tokens without a discovery document — OmniConnect AuthService. `\n` escapes are accepted (env vars). |
| `Jwt:Audience` | **Required.** Tokens for other applications are rejected. `Jwt:Issuer` optional (taken from the authority). |
| `Jwt:SymmetricKey` | HMAC key for local testing only (≥32 bytes). |
| `Claims:*` | Names of the claims carrying user id (`sub`), name, email, roles (`role`), permissions, and `Administrator` (a `"true"` claim; empty = unused). Roles/permissions may be repeated claims, a JSON array, or comma-separated. |
| `AdministratorPermissions` | Granted when the Administrator claim is `"true"` (default `*`). |
| `RolePermissions` | Host role → Case Management permissions (exact, case-insensitive match; `"*"` = all). Defaults exist for Agent / Team Lead / Supervisor / Admin as placeholders. |
| `BaselinePermissions` | Granted to every signed-in user (default `cases.read`, `customers.read`). |
| `Directory:*` | Optional. Host user-directory API (`BaseUrl`, `ListPath`, `GetPath` with `{id}`, `ItemsProperty`, `Fields` map, `ApiKey`), `SyncIntervalMinutes`, `DeactivateMissing`. |

### Permissions Case Management enforces (server side, per endpoint)
`cases.read` `cases.write` `cases.assign` `customers.read` `customers.write` `config.manage` `teams.manage` `monitoring.view` `monitoring.nudge` `audit.view`
`cases.assign` lets someone change who holds **any** case (assign, reassign, transfer). Without it, a person with `cases.write`
may do so only for cases they hold, or that belong to a team they lead or are an active member of. Default mapping: Team Lead,
Supervisor, Admin (`*`). Add it to any Host role that should reassign across teams.
(Reading shared configuration — lookups, SLA settings, departments, teams — needs only a signed-in user, because every form uses it.)

### Users
- A Host user is **provisioned on first request** from their token claims (id, name, email, role) — no pre-registration, no deploy.
  Claims are refreshed on later requests. Users with no team yet have no department; team membership is managed in Case Management.
- With a `Directory` configured, a background job (if `SyncIntervalMinutes > 0`) creates/updates users and, with
  `DeactivateMissing`, **deactivates (never deletes)** users the Host no longer lists. Deactivated users get `403` and are
  not offered for assignment, but their case history stays intact.
- The Host user id is an **opaque string** (`Users.ExternalUserId`); internal ids stay local.
- Emails are never used to link a Host user to an existing local user.

### Endpoints the Host/UI can rely on
`GET /api/users/me` → `{ user, permissions[] }` · `GET /api/users` (active users, for pickers) · `PUT /api/users/me/status` (Available/Busy/Away/Offline)
`GET /ready` → 200 only when the database is migrated; API calls return `503 + Retry-After` until then (the UI waits for it).

## 3. Local verification
```
cd frontend
npm run remote:build && npm run remote:serve                    # Remote on :3001
npm run host-harness:build && npm run host-harness:serve        # fake Host on :3002  → open /cases
```
The harness reads `localStorage['dev-host-token']` and `['dev-host-api']`; see `frontend/dev-host/main.jsx`.
Backend Host mode for local testing: `HostIntegration__Mode=Host HostIntegration__Jwt__SymmetricKey=<32+ chars> HostIntegration__Jwt__Audience=case-management`
and sign a token with the same key (HS256) containing `sub`, `name`, `role`, `aud`, `exp`.

## 4. Open questions for the Host team (answers are configuration, not code)
JWT vs opaque tokens + JWKS/authority URL · exact claim names · the role list and who gets which permission ·
user-directory API shape · whether the Host can supply team membership · data-scope rules (should a user only see cases of their own team?).

## 5. Running both inside the Host and as its own site (Hybrid)
One backend, one set of users, two ways in:
- **Inside the Host**: the Host mounts the Remote with `getAccessToken`; the backend validates that token.
- **Standalone site** (e.g. `case-cxsuite.vercel.app`): a sign-in screen. The person signs in with their **OmniConnect account**;
  the UI calls the Host's AuthService (`POST /api/auth/login`, refresh via its httpOnly cookie) and sends the resulting token to the
  backend — exactly what the Host would send. The access token is kept in memory only. Optionally a **demo user picker** is offered
  where the backend allows the dev header.

The UI asks `GET /api/session/options` (anonymous) → `{ mode, hostTokens, demoUsers }` to decide what to show.

### Backend (Render) for OmniConnect AuthService tokens
```
HostIntegration__Mode=Hybrid
HostIntegration__Jwt__PublicKeyPem=<AuthService Jwt__SigningKeyPublic>
HostIntegration__Jwt__Issuer=omniconnect-auth-service
HostIntegration__Jwt__Audience=omniconnect-host
HostIntegration__Claims__Permissions=perms
HostIntegration__Claims__Administrator=administrator
# optional demo picker (no real authentication):
HostIntegration__HybridAllowsDevHeader=true
HostIntegration__AllowStandaloneInProduction=true
```
OmniConnect's `role` claim is a role **id**; map those ids in `RolePermissions` (or rely on `administrator`). Non-admins without a
mapping get only `BaselinePermissions` (read-only).

### Standalone frontend (Vercel)
`VITE_AUTH_SERVICE_URL=<AuthService URL>` (no trailing slash). Without it only the demo picker can appear.

### AuthService (OmniConnect repo / Render dashboard)
Add the standalone site to its CORS list, e.g. `Cors__AllowedOrigins__1=https://case-cxsuite.vercel.app`. The refresh cookie
already uses `SameSite=None; Secure`, which a cross-site page needs to stay signed in across reloads.
