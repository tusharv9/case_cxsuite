# Case Management Remote — Host Integration Guide (v0, Phase 1)

Case Management is a **Module Federation Remote**. The Host App owns login, tokens, users and roles;
this Remote only consumes what the Host passes in. Users are **not** created or authenticated here.

## Loading the Remote
- Remote name: `caseManagement`
- Entry: `<remote-origin>/assets/remoteEntry.js` (build: `npm run remote:build`, serve: `npm run remote:serve` → port 3001)
- Exposed module: `./mount`
- The Remote is **self-contained**: it bundles its own React and Router and renders into its **own React root**.
  It does not share React/router with the Host, so the Host's versions and router do not matter and
  there is no nested-router or duplicate-React risk.

```js
// Host side (any framework)
const { mount } = await import('caseManagement/mount');
const handle = mount(containerElement, {
  basename: '/cases',                 // the Host route this is mounted under (Host route: /cases/*)
  getAccessToken: () => token,        // called per request  (consumed from Phase 3)
  currentUser: { id, name, email, roles },
  permissions: ['cases.read', 'cases.write'],
  locale: 'en-MY', timezone: 'Asia/Kuala_Lumpur',
});
handle.update(newProps);              // push refreshed token/user/permissions
handle.unmount();                     // on Host route leave
```

The Host route must be a **splat** (`/cases/*`) so deep links such as `/cases/case-management/<id>` reach the Remote.
Host-side CORS: the Remote origin serves `remoteEntry.js` with `Access-Control-Allow-Origin: *`.
Backend CORS: add the Host origin to `AllowedOrigins` (comma separated). There are no wildcards.

## Props contract
Defined in `frontend/src/remote/hostContract.js` (single source of truth). All props are optional;
without a Host the Remote runs standalone with defaults. **Status:** `basename` is active now; the
identity props are accepted and stored today and are wired to API calls/permissions in Phase 3.

## Local verification
```
cd frontend
npm run remote:build && npm run remote:serve          # Remote on :3001
npm run host-harness:build && npm run host-harness:serve   # fake Host on :3002 → open /cases
```
`frontend/dev-host/` is a throw-away stand-in for the real Host; delete it once the real Host exists.

## Open questions for the Host team (answers become configuration, not code changes)
JWT vs opaque token and JWKS URL · claim names for user id / roles / permissions · user-directory API shape
(list/search/by-id/changed-since) · role list · how the Host exposes timezone/locale.
