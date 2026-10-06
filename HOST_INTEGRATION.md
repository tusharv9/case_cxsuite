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
runs standalone (development only) and sends a development header instead.

## 2. What the backend expects (all of it configuration, section `HostIntegration`)
| Setting | Meaning |
|---|---|
| `Mode` | `Host` (production) or `Standalone` (dev: header identity). Standalone is refused outside Development unless `AllowStandaloneInProduction=true`. |
| `Jwt:Authority` (or `MetadataAddress`) | Host's OIDC authority; signing keys come from its discovery document. |
| `Jwt:Audience` | **Required.** Tokens for other applications are rejected. `Jwt:Issuer` optional (taken from the authority). |
| `Jwt:SymmetricKey` | HMAC key for local testing only (≥32 bytes). |
| `Claims:*` | Names of the claims carrying user id (`sub`), name, email, roles (`role`), permissions. Roles/permissions may be repeated claims, a JSON array, or comma-separated. |
| `RolePermissions` | Host role → Case Management permissions (exact, case-insensitive match; `"*"` = all). Defaults exist for Agent / Team Lead / Supervisor / Admin as placeholders. |
| `BaselinePermissions` | Granted to every signed-in user (default `cases.read`, `customers.read`). |
| `Directory:*` | Optional. Host user-directory API (`BaseUrl`, `ListPath`, `GetPath` with `{id}`, `ItemsProperty`, `Fields` map, `ApiKey`), `SyncIntervalMinutes`, `DeactivateMissing`. |

### Permissions Case Management enforces (server side, per endpoint)
`cases.read` `cases.write` `customers.read` `customers.write` `config.manage` `teams.manage` `monitoring.view` `monitoring.nudge` `audit.view`
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
