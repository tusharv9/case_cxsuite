# Case Management (CX Suite) — Enterprise Audit, Functional Verification & Architectural Review

**Scope:** `backend/` (ASP.NET Core 10, EF Core + Npgsql/PostgreSQL), `frontend/` (React 19 + Vite 8), `tests/`, deployment files (`render.yaml`, `Dockerfile`, `vercel.json`).
**Method:** Static, evidence-based trace of UI → API → Controller → Service → DB for every major feature. I read the code paths end to end (≈58k lines incl. CSS/migrations).
**Not done (be aware):** I did **not** run the application, hit the live Neon database, run the test-suite, or inspect production data. Everything below is derived from source, git history and the committed `backend.log`. Where a claim depends on runtime state I say so. **No code, config or data was modified.**

Legend: 🟢 Fully Working · 🟡 Partially Working · 🟠 Backend Only · 🔵 Frontend Only · 🔴 Broken · ⚫ Hard-coded / Mocked · ⚪ Unused / Dead

---

## Executive Summary

**What this system is:** a well-structured *demo-grade* case-management platform with a genuinely good core (case lifecycle, transactional writes, DB-side pagination, an ordered routing-rule engine, strategy-pattern assignment, snapshotted SLA targets, business-hours/holiday calendar, audit trail). The *engine* is real in many places. What lets it down is (a) **no authentication**, (b) **several "configuration screens" that the runtime ignores or contradicts**, (c) **four different SLA calculations that disagree with each other**, (d) **mock numbers in Team Monitoring**, and (e) **a startup path that runs ~100 raw DDL statements plus a 1,500-line seeder on every boot against a remote database**.

| Area | Verdict |
|---|---|
| Architecture quality | Good layering (Controllers → Services → Repositories, DI, Options pattern, FluentValidation). `CaseService.cs` (2,645 lines) is a god-class; `ConfigurableSettingsPage.jsx` (2,448) and `CasesSlaRoutingPage.jsx` (1,745) are god-components. |
| Biggest risks | **No real authN/Z** (any caller who knows a GUID is any user, incl. creating users and editing all config); **live DB password committed to git (HEAD and history)**; masking of the ID value is cosmetic (frontend-only); startup ≈ tens of seconds on cold DB. |
| Biggest functional gaps | Config ≠ behaviour for: escalation triggers, required-field toggles, severities/case types/channels masters, assignment algorithm scope, team channels/queues, SLA-notification rules. Customer-360 Products/Timeline/Transactions/Referral tabs are UI-only (backend tables were dropped). |
| Hard-coded areas | Team Monitoring (KPIs, queue health, CSAT, handled-today), escalation target resolution (role-name `Contains`), skill keywords, case-create option lists, routing-rule dropdowns, timezone, fallback SLA numbers, seeder IDs/names. |
| Performance | Backend start-up (EnsureCreated + ~100 DDL + seeder per boot, remote Neon: log shows 52 s and 30 s command timeouts). Team Monitoring polls 4 endpoints every 8 s, each loading all open cases/users. `TeamService` loads every case of every team. One 1 Hz timer per case card. |
| Enterprise readiness | **Not enterprise-ready.** Fine as a pilot/demo; would fail a security review on day one. |

---

## 1. Architecture Map

```
Browser (React 19, Vite, react-router 7, axios, react-window)
 ├─ main.jsx → App.jsx → AppProvider (users/toasts/holidays/BH) → CaseProvider (board) → Router
 ├─ pages/  Dashboard · CustomerDirectory · Customer360 · CaseManagement(board/list) · CaseAuditTrail
 │          CasesSlaRouting · ConfigurableSettings · Teams · TeamMonitoring       (all lazy-loaded)
 ├─ components/drawer/*  CreateCase · CreateCustomer · ExistingCustomer · CreateTeam · CreateRoutingRule · Case · Collaboration · Attachments · AuditDetails
 ├─ services/*.js → one axios instance (services/api.js), header  X-User-Id  (localStorage / hard-coded default)
 └─ polling: unread-badge 8 s (visibility-aware) · Team Monitor 4 endpoints / 8 s · 1 s `useNow` timers
          │  HTTPS (Vercel → Render) ; dev: Vite proxy → :5110
ASP.NET Core 10 (backend/Program.cs)
 ├─ Middleware: ExceptionMiddleware → CorrelationId → Swagger → [DB bootstrap at startup] → CORS → UserAuthorizationMiddleware
 ├─ Controllers (14): Cases, CasesSlaRouting, RoutingRules, Teams, TeamMonitoring, Departments, Customers, ConfigurableSettings, Notifications, Dashboard, Audit, Search, Users
 ├─ Services: CaseService(2.6k) · SlaRoutingService · BusinessTimeService · RoutingEngineService + 3 IAssignmentStrategy · TeamService · TeamMonitoringService
 │            ConfigurableSettingsService · NotificationService · PiiMaskingService · CustomerService · DepartmentService
 ├─ Hosted: SlaEscalationBackgroundService (every 2 min → CaseService.EvaluateSlaEscalationsAsync)
 └─ EF Core (AddDbContextPool, retry-on-failure) → PostgreSQL (Neon, pooler endpoint)
Database: Cases, Customers(+CustomAttributes), Departments(=Teams), Users, TeamMembers, CaseEvents(=audit log AND timeline), Notifications,
          FieldConfigurations, LookupTypes/Values, CaseTypeConfigs, DepartmentSubCategories, SlaConfigurations(legacy),
          PrioritySlaRules + PriorityCategoryMappings, BusinessHours, PublicHolidays, EscalationLevelConfigs,
          RoutingRules, AssignmentConfigurations, AgentSkills, TeamAssignmentPointers, CaseAttachments, CaseCollaborationActivities, CaseChildRelations, LinkedCases
```

**Key structural fact:** `Department` **is** the "Team" (one table, `Teams` API is a facade over `Departments`). There is no Queue, Skill-management or Channel-eligibility entity that the runtime actually uses.

---

## 2. Feature-by-Feature Audit

| Feature | Frontend | Backend | Database | Runtime | Configurable | Status | Major Issue |
|---|---|---|---|---|---|---|---|
| Case create (existing customer) | CreateCaseDrawer | `CasesController.POST` → `CaseService.CreateCaseAsync` | Cases, CaseEvents | Works, transactional | Partly | 🟡 | Option lists/required flags hard-coded in both tiers (see §6) |
| Customer create / search | CreateCustomerDrawer / ExistingCustomerDrawer | `CustomerService`, FluentValidation, unique partial indexes | Customers | Works | Partly | 🟡 | ID-type list + required fields hard-coded; ignores `FieldConfigurations` |
| Priority from sub-category | Drawer computes locally from full SLA config | `ResolveEffectivePriorityAsync` (authoritative) | PriorityCategoryMappings | Works (backend recomputes) | Yes (mapping) | 🟡 | Mapping keyed by *category name*; priority collapsed to 4 fixed values |
| SLA targets at creation | — | `GetActivePrioritySlaRuleAsync` + `BusinessTimeService` | PrioritySlaRules, snapshot on Case | Works | Yes | 🟢/🟡 | Snapshot is good; but 3 other SLA formulas elsewhere disagree |
| SLA pause/resume | Shows "paused" client-side | `UpdateCaseStatusAsync` | SlaPausedAt, SlaTotalPausedMinutes | Counters kept | — | 🔴 | Pause does **not** move `InternalResolutionDueAt` that breach detection uses |
| Business hours / holidays | CasesSlaRoutingPage | `BusinessTimeService` | BusinessHours, PublicHolidays | Works | Yes | 🟢 | TZ hard-coded to Asia/Kuala_Lumpur; 2 DB round-trips per call |
| Escalation matrix | CasesSlaRoutingPage | `EvaluateSlaEscalationsAsync`, `EscalateCaseAsync`, `SlaRoutingService` | EscalationLevelConfigs | Auto + manual work | Levels yes, **triggers no** | 🟡 | Trigger is free text in UI; target resolution via role-name `Contains` |
| Routing rules | CasesSlaRoutingPage + CreateRoutingRuleDrawer | `RoutingEngineService` | RoutingRules(JSON conditions) | Executed at case create | Yes (rules) | 🟡 | UI condition dropdowns hard-coded; `TargetQueueName` stored, never used |
| Assignment algorithms | Algorithm cards | 3 strategies | AssignmentConfigurations | Executed | Global only | 🟡 | Per-department config column exists but ignored; Round-Robin ignores capacity; skill data has no UI/API |
| Teams page | TeamsPage + CreateTeamDrawer | `TeamService` | Departments, TeamMembers | Create/toggle/remove-member work | Partly | 🟡 | No edit UI (API exists); channels hard-coded on create and unused by routing |
| Team Monitoring | TeamMonitoringPage | `TeamMonitoringService` | Users, Cases | Renders | No | ⚫ | Fallback constants + hash-based "mock seed" CSAT/handled; no team dimension |
| Notifications | Header + NotificationsPopup | `NotificationService` | Notifications | Event + poll | No (policy removed) | 🟡 | Second SLA engine runs only when list endpoint is called |
| Configurable Settings – fields | ConfigurableSettingsPage | `ConfigurableSettingsService` | FieldConfigurations | Label/order/visible honoured on Create Case; required partly | Partly | 🟡 | See §15–16 |
| Masking | maskUtils (frontend) + PiiMaskingService | Masks nric/phone/email/DoB only | FieldConfigurations | Partial | Partly | 🔴 | `IdValue`, `Passport`, `AccountNumber` never masked server-side; no `nric` config row exists |
| Dashboard | DashboardPage | `GetDashboardSummaryAsync` | aggregates | Works when API reachable | Lookup-driven filters | 🟡 | SLA % uses a 3rd formula; failure shows 100 % / zeros silently |
| Customer 360 | Customer360Page | Customer detail | Customers | Overview + Cases tabs work | — | 🟡/🔵 | Products/Timeline/Transactions/Referral tabs have **no backend** |
| Case Audit Trail | CaseAuditTrailPage | `CaseEvents` | CaseEvents | Works | — | 🟢 | Same table as per-case timeline (fine, but grows unbounded) |
| Attachments | AttachmentsDrawer | `UploadAttachmentAsync` | CaseAttachments + local disk | Works | `AttachmentOptions` | 🟡 | Local disk on Render free tier is ephemeral; no per-case authz |
| Unsaved-changes guard | Only Settings page | — | — | Partial | — | 🟡 | Not reusable/central |
| Authentication / Authorization | `X-User-Id` header | `UserAuthorizationMiddleware` | Users | "Exists" check only | — | 🔴 | Not authentication |

---

## 3. Bugs

| ID | Sev | Feature | File | Problem | Root cause | Impact | Recommended fix |
|---|---|---|---|---|---|---|---|
| B-01 | **Critical** | AuthN/Z | `backend/Middleware/UserAuthorizationMiddleware.cs:21-40`; `Controllers/UsersController.cs` (POST); `frontend/src/services/api.js` | Identity = a client-supplied `X-User-Id` GUID; `GET /api/users` is deliberately open and returns every user's GUID; `POST /api/users` lets any caller create a user with any `Role`. No roles/permissions anywhere (`[Authorize]` absent). Any caller can edit SLA/routing/escalation/fields, nudge agents, read all customer PII. | Auth was stubbed ("until auth is wired") | Full compromise of data and config | Real authN (OIDC/JWT) + role/permission policies (Agent, Team Lead, Supervisor, Admin) enforced server-side; remove open user listing/creation |
| B-02 | **Critical** | Secrets | `tests/CaseManagement.Tests/bin/Debug/net10.0/appsettings*.json` (tracked at HEAD); git history commits `6a271d9`, `ee99ffd` (`backend/appsettings.json`) | Neon DB username/password committed in plaintext (working tree `backend/appsettings*.json` also contain it; ignored now, but history/HEAD retain it). 140 `bin/obj` files are tracked. | Build output committed; secrets-in-config | Credential exposure to anyone with repo access | **Rotate the DB password now**, purge history, untrack `bin/obj`, use env vars / secret store |
| B-03 | High | Startup | `backend/Program.cs:160-679` | `EnsureCreated()` + ≈100 raw `ExecuteSqlRaw` DDL statements + `DbSeeder.Seed` on **every** boot, sequentially, over a remote pooled Neon connection. `Migrations/` (7 files) are never applied (`EnsureCreated` and `Migrate` are mutually exclusive). Errors are swallowed to `Console.WriteLine`. | Schema managed by ad-hoc bootstrap rather than migrations | Slow, non-deterministic start; schema drift between EF model/migrations/raw SQL; destructive statements (`DROP TABLE … CASCADE`, `UPDATE Customers SET CustomerSegment=NULL`) re-run on every boot in production | Adopt real migrations (`dotnet ef migrations` + `Migrate()` in a deploy step), move seed to an explicit one-shot command, delete DDL from `Program.cs` |
| B-04 | High | First-run empty dashboard | `frontend/src/constants/index.js:9`; `contexts/AppContext.jsx:8-10,64-84`; `services/api.js:9-10`; `pages/Dashboard/DashboardPage.jsx:138-158`; `backend.log` | See §13. Request fired with a hard-coded/stale user id and/or before backend/Neon is ready; failures are `console.error`-ed and the page renders zeros / "100 %" | No readiness gate, no error state, no retry, seeded user GUID hard-coded in the bundle | Looks like "no data" on first run, "works" on second | Gate the app on `/health` + bootstrap user; show error/retry; never hard-code a user GUID |
| B-05 | High | Severity master vs create | `CaseService.cs:2572-2574`; `ConfigurableSettingsService.cs:553-601`; `SlaRoutingService.cs:761-773` | Admins can **add severities** (Master Data) but case creation rejects anything except `Critical/High/Medium/Low`; and `CanonicalizePriority` maps any unknown value to `Medium`. `ResolveSeverityAsync` (config-driven) is dead because `_slaRoutingService` is never null. | Two parallel priority systems (`CASE_SEVERITY`+`SlaConfigurations` vs `PrioritySlaRules`) | Configured severity is unusable; SLA hours entered on that screen are ignored at creation | Pick one source of truth (`PrioritySlaRules` keyed by lookup id) and delete the other |
| B-06 | High | SLA consistency | `CaseService.EvaluateSlaEscalationsAsync` (1891), `CaseService.GetDashboardSummaryAsync` (2211+), `NotificationService.CheckAndGenerateSlaNotificationsAsync` (148+), `frontend/utils/slaUtils.js` | Four SLA formulas: (1) background = business-minutes vs **internal** target; (2) dashboard = calendar hours vs **external** `SlaTargetHours` + paused; (3) notifications = `SlaStartTime + SlaTargetHours` (no pause, no business hours); (4) browser = calendar + paused, plus global "BH paused" flag | Logic copy-pasted per feature | Same case can be "breached" on dashboard, "healthy" on card, "escalated" by worker | One `SlaClock` domain service used by worker, dashboard, notifications; send computed state to UI |
| B-07 | High | SLA pause / reassign | `CaseService.cs:399-413,420,1943-1944`; `:498-502` | (a) Breach check uses stored `InternalResolutionDueAt` and **does not add** `SlaTotalPausedMinutes`; "Waiting on Customer" therefore does not postpone breach/escalation although the % bar subtracts it. (b) `AssignCaseAsync` resets `SlaStartTime = now` but leaves all `*DueAt` snapshots unchanged and re-reads legacy `SlaConfigurations` for `SlaTargetHours`. (c) Pause minutes are calendar minutes while due dates are business minutes. | Pause/reassign not applied to the due-at model | Premature breaches/escalations; contradictory timers | Recompute `DueAt` on resume (business-time aware); don't reset start on reassign unless policy says so |
| B-08 | High | Escalation | `SlaRoutingService.cs:448-474,512-554`; `CaseService.cs:1697-1765,1975-2010`; `CasesSlaRoutingPage.jsx:1183-1195,1640-1655,490-516` | Trigger is a **free-text** field in the UI (`triggerDescription`); runtime uses `TriggerType/TriggerValue`, which new levels get as `SlaPercentage`/null → fires at default 70 %. "Update level" ignores trigger type/value. `IsActive` on a level is never checked by the worker. Deleting a level re-sequences numbers but cases keep their old `EscalationLevel`. Flags `Sla90Escalated/SlaBreachedEscalated/Sla12hBreachedEscalated` are level-number hacks. 70 % reminder (`Sla70ReminderSent`) is hard-coded, not driven by Level 1's config. On API failure the UI **fabricates** a level locally and reports success (lines 496-516). | Descriptive text decoupled from executable trigger | Operators believe thresholds changed when they didn't | Structured trigger editor (type + value + unit) bound to runtime; honour `IsActive`; remap cases on delete; remove fake local fallback |
| B-09 | High | Required/valid values | Backend `CaseService.cs:2520-2576`; Frontend `CreateCaseDrawer.jsx:329-360` | 9 fields are "strict mandatory invariants" in **both** tiers regardless of `FieldConfigurations.IsRequired`; case types, source channels (Voice/Email/WhatsApp), preferred channels, severities are hard-coded arrays even though `CaseTypeConfigs` and `COMMUNICATION_CHANNEL` lookups (which also contains SMS/Branch/Web Chat/Social) exist. | Config added later; validators never re-wired | Disabling "Required" or adding a lookup value has no effect / is rejected | Validate against config tables; treat `IsRequired` as source of truth |
| B-10 | High | Dependent config | `CreateCaseDrawer.jsx:~225-234`; `CaseService.cs:2546-2551` | If a department has no sub-categories the drawer shows invented options (`General Request`, `Issue Escalation`, `Information Update`) which the backend then rejects. A newly created Team can't receive manually created cases until sub-categories exist. | Fake fallback list | Confusing 400 errors; orphan department | Disable/explain instead of faking; enforce "department needs ≥1 sub-category" at activation |
| B-11 | Medium | Routing engine | `RoutingEngineService.cs:171,193-197,258-267,327-333`; `RoundRobinAssignmentStrategy.cs`; `SkillBasedAssignmentStrategy.cs:16-34` | See §9: global-only config; capacity ignored by Round-Robin; keywords (`fraud/loan/asb/card/atm`) hard-coded; fallback department `Code == "CC"`; N+1 department query per rule; pointer advanced + `SaveChanges` *inside* strategy, outside the case transaction; no concurrency control on pointer; assigns to Away/offline users if nobody online | Prototype logic | Wrong/duplicate assignment under load; config not honoured | Move to per-queue config; transactional, row-locked assignment |
| B-12 | Medium | Team membership | `RoundRobin…:30-42`, `LeastOccupancy…:23-40`, `SkillBased…:42-55` | Eligible agents = `TeamMembers(IsActive)` **∪** `Users.DepartmentId == dept`. Removing someone from a team (TeamMember delete) does not remove them from routing if their home `DepartmentId` matches. | Two sources of truth for membership | Removed agents still get cases | Single membership table |
| B-13 | Medium | Notifications | `NotificationService.cs:64,148-160,33-52` | SLA breach/approaching notifications are generated **only when someone calls `GET /api/notifications`** (not by the worker, not by `unread-count` polling). The 5-minute de-dup in `CreateNotificationAsync` silently drops a second legitimate notification of the same type/case/recipient (e.g., two status changes in 5 min). | Piggy-backed check; coarse de-dup key | Missed/late alerts | Emit notifications from the worker/events; de-dup by event id |
| B-14 | High | Data exposure | `PiiMaskingService.cs:75-108`; `MappingExtensions.cs:111,208`; `maskUtils.js`; `DbSeeder.cs:347-364` | Server masks only `nric`, `phoneNumber`, `email`, `dateOfBirth`. Seeded configs use `idType/idValue` (no `nric` row exists), so *no* server-side masking can be switched on from the UI for ID; `IdValue`, `Passport`, `AccountNumber` are returned in full. Masking of `idValue` happens in the browser only. Frontend (`X`, `HideMiddle` returns *unmasked* when short) and backend (`*`, masks all when short) rules differ. | Masking keyed to field names that don't exist in config | Sensitive ID visible in network response | Mask by config for every field in DTO; single masking implementation; deny-by-default |
| B-15 | Medium | Team Monitoring | `TeamMonitoringService.cs:30-31,71,82-88,122-125,153-169` | Mock/default values: longest wait `38`, "Email queue — above 15m target", AHT `372 s`, delta `-40`, occupancy default `78 %` (clamped 60-95 %), `3/6` agent fallbacks, **CSAT and handled-today derived from `GetHashCode()` of the name**, queue "waiting" falls back to per-channel fake defaults. UI repeats `?? 3 / ?? 6`. No team/queue dimension. "Offline" is unreachable (`UserStatus` = Available/Busy/Away). | Wallboard mock left in | Operators see invented numbers | Compute from DB, show "no data", add team filter |
| B-16 | Medium | Customer 360 | `Customer360Page.jsx:354-436`; migration `…RemoveObsoleteCustomer360Architecture`; `Program.cs:176-180` | Products, Timeline, Transactions, Referral tabs render from `customer.products/timelineEvents/transactions/referrals`; the DTO has none of them and the tables are dropped at startup. | Backend removed, UI not | Dead tabs always empty ("Products (0)") | Remove tabs or rebuild with real source |
| B-17 | Medium | Priority mapping integrity | `SlaRoutingService.cs:176-179,237-244,610`; `AppDbContext.cs:292` | Mappings are rebuilt from scratch on every save (`RemoveRange` all, re-add), keyed on **`CategoryName`** (globally unique), `DepartmentSubCategoryId` never populated by that code path; `EF.Functions.ILike(…, userText)` treats `%`/`_` as wildcards; same sub-category name in two departments collides; rename/delete of a sub-category leaves/misses mappings. | Name-based join | Wrong priority or silent loss of mapping | Key by `SubCategoryId`; unique on it; cascade/validate |
| B-18 | Medium | Unsaved changes | `CasesSlaRoutingPage.jsx:226`; `ConfigurableSettingsPage.jsx:165,481-491` | Only Configurable Settings guards navigation/refresh. Cases-SLA-Routing computes `isDirty` but has no router blocker / `beforeunload`; Teams/Create* drawers have none. | Per-page implementation | Silent data loss | Central `useUnsavedChangesGuard` + router blocker |
| B-19 | Medium | Perf | `TeamService.cs:25,222`; `:94-98` | `GetTeamsAsync` `Include(d => d.Cases)` loads **every case of every team**; `GetTeamByIdAsync`/Create/Update/Toggle call it again. | Count via navigation load | O(total cases) per team call | `GroupBy`/count query |
| B-20 | Medium | Perf | `TeamMonitoringService.cs` all methods; `TeamMonitoringPage.jsx:44-52` | Four endpoints, each `ToListAsync` of all open cases/users; polled every 8 s with no visibility check or in-flight guard. | | Load grows with data and users | Aggregate in SQL; one summary endpoint; SignalR/SSE or visibility-aware polling |
| B-21 | Medium | Perf | `CaseCard.jsx:22`, `CaseList.jsx:23`, `SlaDisplay.jsx:14` (+ `useNow.js`) | One `setInterval(1000)` and 1 Hz re-render per card/row. | | CPU/battery on large boards | Single shared ticker context |
| B-22 | Medium | Attachments | `CaseService.cs:1497-1590`; `backend/Uploads/…` (tracked) | Files written to local disk (ephemeral on Render free plan, not shared across instances); `.svg` allowed (served back with client-supplied `ContentType`); no per-case/role check on download; sample uploads (incl. screenshots) committed to git. | | Data loss, stored-XSS risk, data leakage | Object storage, content sniffing, force `Content-Disposition: attachment`, authz |
| B-23 | Medium | Web security | `Program.cs:42-66,153`; `render.yaml`; `appsettings.json` | CORS accepts any `*.vercel.app` **with credentials**; Swagger on by default in Production (`EnableSwagger` default `true`, also set in `render.yaml`); `AllowedHosts: *`. | | Wider attack surface | Explicit origins; Swagger off in prod |
| B-24 | Medium | Seeder resurrects data | `DbSeeder.cs` (`EnsureTeamsAndSquads`, `EnsureRoutingRulesAndSkills`, `SeedDevUsers`) | Idempotent "Ensure*" re-create departments/users/rules/skills if a name/code match is missing, on every boot — a deleted "Fraud" team or seeded dev users come back. Dev users (`@bank.com`) are seeded in production. | Seed doubles as migration | Surprise data; privileged-looking roles exist in prod | Separate dev seed from prod bootstrap |
| B-25 | Low | Field config API | `ConfigurableSettingsRepository.cs:74-95`; `ConfigurableSettingsService.cs:112-157` | Single-field `PUT` doesn't persist `ValidationRegex/MinLength/MaxLength`; audit "old value" lookup hard-codes module `"Customer360"` so CaseManagement fields log `null` old values. | | Inconsistent audit & validation | Use one update path |
| B-26 | Low | Case-create custom fields | `ConfigurableSettingsService.AddCustomFieldAsync`; `Case.cs`; `CreateCaseDrawer.renderConfiguredField` | Custom fields can be defined for any module/section, but `Case` has no custom-attribute storage and the drawer renders only 10 known `apiField` keys (no `fieldType` rendering, no generic branch). | | A "custom case field" would never appear/persist | Add `CaseCustomAttribute` + generic renderer |
| B-27 | Low | Observability | everywhere | `Console.WriteLine` for errors, many `catch { }` that swallow; `ExceptionMiddleware` maps `ArgumentException` to 404 by string-matching "not found". | | Hard to operate | Structured logging, typed exceptions/ProblemDetails |

---

## 4. Hard-Coded Data

Classification key: **A** dynamic · **B** seed · **C** acceptable constant · **D** hard-coded & problematic · **E** mock · **F** duplicated config.

| File | Data | Current source | Should be | Class | Risk | Recommendation |
|---|---|---|---|---|---|---|
| `frontend/src/constants/index.js:9` | `DEFAULT_USER_ID = '89c65b43-…'` | Bundle | Never hard-code; come from auth session | D | First-run 401/empty UI | Remove |
| `constants/index.js` | `CASE_STATUS`, `SEVERITY`, `SEVERITY_SLA_MAPPING`, `*_FILTER_OPTIONS`, `SOURCE_CHANNEL_OPTIONS`, `PREFERRED_COMMUNICATION_CHANNEL_OPTIONS`, `BOARD_COLUMNS` | Bundle | Statuses = C (engine enum); severity/channels = lookups (A) | D/F | Drifts from DB masters | Fetch lookups once, share via context |
| `CreateCaseDrawer.jsx` | `DEFAULT_CREATE_CASE_FIELDS`, fallback case types, languages (`Mandarin`, `Tamil` not in lookup), channels, fake sub-categories, default `Medium` | Bundle | DB | D/E | Invalid values rejected by API | Remove fallbacks, show error |
| `CreateRoutingRuleDrawer.jsx:244-315` | Case types, priorities, **customer segments (Priority/SME/Retail)**, channels | Bundle | Lookups; segments from lookup/Customer data | D | Segments don't exist in DB (seeder nulls Gold/Mass/Retail/Premier) | Dynamic options |
| `CreateTeamDrawer.jsx` | `channels: 'Voice,Chat,Email,Social'` | Bundle | Per-team selection | D | Channels unused by routing anyway | Add channel eligibility or drop |
| `CaseService.cs:2539,2553,2560,2572` | Case types, source/preferred channels, severities | Code | Config tables | D | Config ignored | Validate against masters |
| `CaseService.cs:142-145,1664-1695` ; `SlaRoutingService.cs:637-643` | SLA fallback numbers 30/120/240 min; 4/8/12/24 h | Code | Required config (fail loudly) | D | Silent wrong SLAs | Fail with clear error |
| `CaseService.cs:121-129` | `Service→S-`, `Inquiry→I-` prefix fallback | Code | `CaseTypeConfigs` | D | | Remove |
| `CaseService.cs:1697-1765`; `SlaRoutingService.cs:694-759` | Level 1-4 semantics, role substrings `Lead`, `Supervisor`, `Head` | Code | `EscalationLevelConfig.TargetRole` + explicit role entity | D | A user named "Head Teller" becomes Head of CX | Role table + exact match |
| `Models/Case.cs:Sla90Escalated…` | Level-number flags | Schema | Derived from event log | D | Not extensible | Drop |
| `RoutingEngineService.cs:267`; `TeamService.cs:26` | `Code == "CC"`; exclude `CS`,`MT` | Code | Config / data | D | Brittle IDs | Config flag |
| `SkillBasedAssignmentStrategy.cs:16-34` | Keyword→skill map | Code | `Skill` + keyword rules table | D | Not configurable | Metadata |
| `BusinessTimeService.cs:25-41`; `slaUtils.js:60` | `Asia/Kuala_Lumpur`, UTC+8 | Code | Per-tenant setting | D | Wrong for any other region | Config |
| `TeamMonitoringService.cs` / `TeamMonitoringPage.jsx` | See B-15 | Code | DB | **E** | Fake KPIs | Compute |
| `NotificationService.cs:12-20` | Cooldown/max reminders/aggregation policy | Code (rule UI removed) | Settings | D | Not tunable | Settings |
| `NotificationService.cs:~400` | Config-change notification recipients = role contains `Admin`/`Officer`/`Agent` | Code | Role-based subscription | D | Everyone notified | Role table |
| `DbSeeder.cs` | Departments, ~20 users, rules, skills, holidays/levels | Seed | Seed **only** in dev | B→D | Prod pollution | Separate |
| `SlaConfigurations` vs `PrioritySlaRules` vs frontend `SEVERITY_SLA_MAPPING` | SLA numbers in three places | DB+DB+bundle | One | **F** | Divergence | Consolidate |
| `Department.Channels`, `User.Team/Queue` strings vs `Departments`/`TeamMembers` | Team identity duplicated as free text | DB | One | **F** | Drift | Remove free-text |
| `frontend/.env`, `.env.production` | API base URLs | Tracked | Env at deploy time | C | Low | Fine, but untrack `.env` |

---

## 5. Frontend Audit

**Strengths:** lazy-loaded routes; single axios instance with normalised errors; hook/service separation; virtualised board (`react-window`), server-side pagination, debounced search; visibility-aware notification polling; reusable `Input/Select/Textarea`, `Pagination`, `Modal`, `ConfirmDialog`, `Skeleton`, `Toast`, `Tabs`, `Badge`.

**Issues**
1. **Drawer duplication.** Six independent drawer implementations (`create-drawer-overlay`/`createPortal` markup repeated in CreateCase, CreateCustomer, CreateTeam, CreateRoutingRule, ExistingCustomer; separate CSS for Case/Collaboration/Attachments/AuditDetails). Recommend one `<SideDrawer title footer dirty onClose>` + `useUnsavedChangesGuard`.
2. **God components:** `ConfigurableSettingsPage` 2,448 lines, `CasesSlaRoutingPage` 1,745, `DashboardPage` 1,128, `CaseActions` 1,078, `CaseDrawer` 994.
3. **No central bootstrap/readiness:** pages fire requests independently of `AppContext` user bootstrap (B-04).
4. **Duplicate API calls / over-fetch:** Dashboard mount = 8 requests (departments + 5 lookups + summary); CreateCase open = 8 requests including the *entire* SLA configuration (users, holidays, levels…) just to build a category→priority map; `GET /api/users` loaded by `AppProvider` and again by `useUsers`; `getConfiguration()` loaded by `AppContext` and each page. Add a small cached "metadata" endpoint/store and a dedicated `resolve-priority` endpoint.
5. **Silent failure:** `catch → console.error` in Dashboard/Teams/Team Monitor; empty-state ≠ error-state; `SLA adherence` defaults to `'100'` when data is missing.
6. **Validation:** duplicates server rules and diverges from config (B-09); `fieldType` from config ignored in Create Case.
7. **Timers:** per-card `useNow(1000)` (B-21). Dashboard `useNow(10000)` re-renders whole page.
8. **Dead / unused:** `caseService.getBoardCases`, `getEscalationMatrix`; `departmentService.invalidateCache`, `setDepartmentOwner`; `teamService.getTeamById/updateTeam/deleteTeam/addMember`; `userService.createUser` (all uncalled → **Remove or wire**). Customer-360 Product/Timeline/Transaction/Referral components → UI-only (B-16). `@originjs/vite-plugin-federation` configured with `remotes: {}` (unused complexity; `minify:false` in production build inflates bundle).
9. **Hard-coded tooling:** `useNow` pattern, UTC+8 logic in `slaUtils.js` duplicates server business-time logic.

## 6. Backend Audit

- **Controllers:** thin and consistent via `BaseApiController`; **no `[Authorize]` anywhere**; no per-role checks even for destructive/config endpoints.
- **Services:** `CaseService` (2.6k lines) mixes creation, workflow, collaboration, attachments, escalation, SLA worker, dashboard, audit. Split into `CaseWorkflowService`, `SlaService`, `EscalationService`, `DashboardQueryService`, `AttachmentService`.
- **Transactions:** `ExecuteInTransactionAsync` with execution strategy is good, but **routing/assignment runs outside** the case-create transaction and Round-Robin calls `SaveChanges` itself.
- **Business logic correctness:** see B-05…B-13. Status machine (`AllowedTransitions`, `CaseService.cs:2183`) has no path to `Accepted/Rejected/Pending/Closed` although the enum and lookups define them (only Resolve/Reopen workflows) → **dead enum values**.
- **Validation:** FluentValidation for customers; imperative `ArgumentException` for cases. Mixed. Invalid regex in config is swallowed (`CaseService.cs:~2620`).
- **Error handling:** central middleware (good) but string-matching and `Console.WriteLine`.
- **Performance:** `ResolveEscalationTargetAsync` / `ResolveNextEscalationTargetAsync` load **all users** per call (and per level in `GetEscalationMatrixConfigAsync`); `BusinessTimeService` re-queries calendar on every call (3× per case creation, once per case per worker cycle); `GetDashboardSummaryAsync` pulls a row per case for SLA math; worker query `OR`-conditions load full `Case` + `Owner` entities.
- **Integration gaps (Implemented backend + missing integration):** `AssignmentConfiguration.DepartmentId` (per-team algorithm) – model + DB, **no API/UI/engine use**; `AgentSkills` – table + strategy, **no API/UI** (seed only); `RoutingRule.TargetQueueName` – stored, never used; `Department.Channels`/`TeamMember.PrimaryChannel` – stored, never used by routing; `SlaConfigurations` – maintained by Settings UI, only used by dead/legacy paths; `TeamService.Update/Delete/AddMember` – exposed, no UI.
- **Background worker:** every 2 min, one scope, no leader-election → duplicate escalations if scaled to >1 instance; paused cases (`WaitingOnCustomer`) can still be auto-escalated (status forced to `Escalated`, `CaseService.cs:2016`).
- **Tests:** 26 tests, all EF **InMemory** (no relational behaviour, indexes, raw SQL, or transactions exercised). Not run in this audit.

## 7. Database Audit

- **Schema creation:** EF model + migrations + ~100 ad-hoc `ALTER/CREATE IF NOT EXISTS` + `EnsureCreated`. Three "truths". `PrioritySlaRules`, `BusinessHours`, `EscalationLevelConfigs`, `RoutingRules`, `TeamMembers`, etc. are created by raw SQL with defaults that differ from the C# model defaults.
- **Keys/FKs:** mostly sound (`OnDelete` Restrict for users/cases, Cascade for children). `Notifications.UserId` legacy column made nullable via `DO $$ … EXCEPTION WHEN OTHERS THEN NULL`.
- **Indexes:** good performance set (CreatedAt, Dept+CreatedAt, Status+CreatedAt, partial unread index, `pg_trgm` GIN, expression index on normalised NRIC, unique partial indexes on NRIC/Passport/Account/Phone).
- **Integrity gaps:** `PriorityCategoryMappings.CategoryName` unique (name-based join); `DepartmentSubCategory` delete has no dependency check; `EscalationLevelConfig` has no uniqueness handling during re-sequence (works around with negative numbers); `Cases.Severity`, `CaseType`, `SourceChannel`, `Subcategory`, `FirstResponseStatus` are free text (no FK/enum) → rename operations must rewrite rows (`RenameCaseSeverityAsync`).
- **Normalisation:** `Users.Team`/`Users.Queue` (text) vs `Departments`; `Departments.Channels` comma-string; `RoutingRules.ConditionsJson` text (should be `jsonb`); `Case` has 3 channel columns (`SourceChannel`, `CommunicationChannel`, `PreferredCommunicationChannel`) and 3 SLA families (`SlaTargetHours`, `Internal*`, `External*`).
- **Audit:** `CaseEvents` doubles as case timeline *and* system-wide config audit (`CaseId` nullable). Works, but retention, volume and access control need separation.
- **Seed data:** see B-24 / §4.
- **Evidence of DB latency:** `backend/backend.log` (tracked) records `Failed executing DbCommand (52,509ms)` then `(30,003ms)` and a Neon keep-alive timeout during startup — i.e., a *scale-to-zero cold start* amplified by sequential DDL.

## 8. Configurability Audit

| Configuration | UI | API | DB | Runtime effect | Dynamic? | Issue |
|---|---|---|---|---|---|---|
| Field label / order / visible (Create Case) | ✔ | ✔ | ✔ | ✔ (drawer filters `isVisible`, sorts `displayOrder`, uses label) | ✔ | Only 10 known keys render |
| Field **Required** (Create Case) | ✔ | ✔ | ✔ | ✘ for 9 core fields (always required both tiers) | ✘ | Contradicts "config is source of truth" |
| Field type | ✔ | ✔ | ✔ | ✘ in Create Case (switch on `apiField`); ✔ partially in customer drawers (not re-verified) | ✘ | |
| Min/Max/Regex | ✔ (bulk save) | ✔ | ✔ | Backend: yes, only for the 11 mapped keys; Frontend: min/max only, **no regex** | Partial | Single-field PUT drops them |
| Sensitive/Masking/VisibleChars | ✔ | ✔ | ✔ | Backend masks nric/phone/email/DoB only (and `nric` has no config row); `IdValue` never masked server-side | ✘ | B-14 |
| Lookups (languages, branches, channels, ID types) | ✔ | ✔ | ✔ | Languages/branches/channels used by UI; `ID_TYPE` list ignored by validator (`CreateCustomerDtoValidator` hard-codes 3) | Partial | |
| Case types (code/name/prefix) | ✔ | ✔ | ✔ | ✔ prefix used; ✘ validation uses fixed 3 | Partial | |
| Severities (master + SLA hrs) | ✔ | ✔ | ✔ | ✘ create rejects new severities; SLA hours ignored by creation | ✘ | B-05 |
| Sub-categories | ✔ | ✔ | ✔ | ✔ validated by backend (dept→subcat) | ✔ | Delete has no dependency check |
| Priority ↔ sub-category mapping | ✔ | ✔ | ✔ | ✔ backend-authoritative | ✔ | Name-keyed (B-17) |
| Priority SLA matrix (FR/Internal/External) | ✔ | ✔ | ✔ | ✔ snapshotted onto case; version stored | ✔ | Other 3 SLA paths ignore it |
| Business hours / holidays | ✔ | ✔ | ✔ | ✔ used for due-at and worker | ✔ | TZ fixed |
| Escalation levels (add/remove) | ✔ | ✔ | ✔ | ✔ count dynamic; target by role string | Partial | Trigger text decorative |
| Escalation trigger (type/value) | ✘ (free-text) | ✔ (bulk only) | ✔ | Runtime reads type/value | ✘ | B-08 |
| Routing rules (conditions → team) | ✔ | ✔ | ✔ | ✔ executed on create | ✔ | UI option lists hard-coded |
| Rule order / toggle / delete(soft) | ✔ | ✔ | ✔ | ✔ | ✔ | |
| Assignment algorithm (global) | ✔ | ✔ | ✔ | ✔ | ✔ (global) | Per-team unsupported |
| Max concurrent capacity | ✔ | ✔ | ✔ | LeastOccupancy ✔; RoundRobin ✘; SkillBased ✘ | Partial | |
| Notification policy (cooldown/max reminders) | removed | — | — | Hard-coded | ✘ | |
| Dashboard quick actions / date ranges | lookups | ✔ | ✔ | ✔ | ✔ | |

---

## 9. Teams & Routing Architecture

**Q1 – Should teams be unlimited/configurable?** Yes — teams/queues/members are *data*. That's already how `Departments` + `TeamMembers` work, and the engine contains **no team-ID or team-name branching** (verified: strategies take `departmentId` as a parameter). That is the right instinct. The problem is what a "team" currently *means*.

**Q2 – Should routing rules be configurable?** Yes (rules, order, conditions, targets). Already true. The *condition vocabulary* (fields you can match on) should be code-defined but *discoverable* (an endpoint listing supported attributes and valid values) so the UI doesn't hard-code option lists.

**Q3 – What happens when a new team ("Team 7") is created?**

| Works automatically | Does **not** |
|---|---|
| Row in `Departments` (+ `TeamMembers`); appears in Teams page, Department dropdowns, routing-rule target dropdown | **No sub-categories ⇒ manual case creation into Team 7 fails** (backend requires dept→sub-category; UI fakes options) |
| Round-Robin / Least-Occupancy / Skill-Based work for it (members from TeamMembers ∪ Users.DepartmentId) | **No Queue entity** (`TargetQueueName` unused); `Department.Channels` / `PrimaryChannel` ignored ⇒ no channel eligibility |
| Open-case count shown on the Team card | **Skills**: no UI/API ⇒ SkillBased degrades to "first Available" |
| Dashboard/board department filters | **Team Monitoring has no team dimension**; **no per-team SLA/priority mapping** (mapping is by category name) |
| | **Escalation target resolution** inside the team depends on `User.Role` containing "Lead/Supervisor/Head" |
| | **Per-team algorithm/capacity** unsupported (global only) |
| | Seeder may re-create seeded teams but won't create Team 7 artefacts |

**Q4 – Can the backend automatically support it?** Partially: *assignment* yes; *classification (sub-category/SLA), queue semantics, monitoring and escalation hierarchy* no.

**Q5 – Where is it hard-coded?** `RoutingEngineService.cs:267` (`Code=="CC"` fallback), `TeamService.cs:26` (`CS`,`MT` excluded), `SkillBasedAssignmentStrategy.cs:16-34` (keywords), `CreateTeamDrawer.jsx` (channels), `CreateRoutingRuleDrawer.jsx` (condition lists), `CaseService.ResolveEscalationTargetAsync` (levels 1-4, role substrings), `TeamMonitoringService` (everything).

**Q6 – Recommended architecture (enterprise, minimal-surprise)**

```
OrgUnit / Department (classification & ownership)  1─* SubCategory ──(SubCategoryId)──> PriorityRule ─> SlaPolicy
Team (people group, lead, active)                  1─* TeamMember(UserId, role, skills[], capacity, channels[])
Queue (work bucket)  = Team + channel set + SLA calendar + AssignmentPolicy(algorithm, capacity)   ← routing target
RoutingRule(conditions JSONB) ─> Queue           Skill(name) ─< AgentSkill(level)    Role(name, level) ─< UserRole
EscalationPolicy ─< EscalationLevel(order, trigger{type,value,unit}, action{notify|reassign}, targetKind{Role|User|TeamLead|DeptOwner})
```

- **Fixed in code (the engine):** assignment algorithm *implementations* (RR, LeastOccupancy, Skill) behind `IAssignmentStrategy`; trigger *types* (`SlaPercentage`, `SlaBreached`, `PostBreachHours`, `FirstResponseBreached`, `Manual`); status state-machine; condition *operators*.
- **Configuration (data):** teams, queues, members, skills, capacity, channels, rules + order, algorithm per queue, escalation levels with *structured* triggers, calendars.
- **Do not expose** a config UI for anything the engine cannot execute (today: team channels, queue names, per-team algorithm, escalation free-text trigger, notification policy).
- **Membership:** one table; deactivating a member/team must remove them from eligibility everywhere.
- **Assignment execution:** inside the case-create transaction, `SELECT … FOR UPDATE SKIP LOCKED` on the pointer/agent rows, respect capacity in *all* strategies, define "no eligible agent" → queue unassigned (not creator/lead by default) + notify.

---

## 10. SLA & Escalation Audit

| Step | Reality |
|---|---|
| Priority calculation | Backend: sub-category→`PriorityCategoryMappings` (case-insensitive name, wildcard-sensitive) → else requested severity → `Canonicalize` to Critical/High/Medium/Low (anything else ⇒ **Medium**; `urgent→Critical`). No rule ⇒ requested/Medium. Multiple matches: first row (undefined order). Deleted rule: mapping cascade-deleted → falls back silently. New sub-category: no mapping until saved on the SLA page. |
| SLA targets | `PrioritySlaRules` (FR/Internal/External minutes). Missing rule ⇒ **hard-coded defaults** (`SlaRoutingService.cs:637`) — never fails. Snapshotted on case + `SlaConfigVersion`. 🟢 |
| Due dates | `BusinessTimeService.AddBusinessMinutesAsync` (per-day window, holidays, weekend, MYT). Handles: created after hours / before opening / on holiday / spanning weekend. **Not handled:** overnight windows, multiple windows per day, DST (MYT has none), per-queue calendars. |
| Pause/resume | Counters updated on status change, but due-at snapshots not shifted (B-07); pause minutes calendar-based. Worker can still auto-escalate paused cases (`Status=Escalated`). |
| Escalation | Levels dynamic in *count*; runtime picks **next level > current** whose trigger is met, one level per 2-min cycle; targets by `TargetUserId` → role-in-department → role-global → fuzzy `Lead/Supervisor/Head` → dept owner → "anyone". `ReassignOwner` honoured. Manual escalate: requires reason; capped at max level. |
| "If I add Level 5 tomorrow?" | It will be stored, shown, and (because TriggerType defaults to `SlaPercentage` with null→70 %) **fire at 70 %** unless trigger fields are edited through the *bulk* save — the UI offers only a free-text description. Target = `TargetRole` substring match; `Sla*Escalated` flags remain 4-level artefacts. **Needs code changes to be correct.** |
| Audit | Config changes and automatic escalations recorded in `CaseEvents`. 🟢 |

## 11. Team Monitoring Audit

| Metric | Source | Class |
|---|---|---|
| Agents online / total | `Users.Status` (Available/Busy) — manually toggled, no presence; **fallback 3 / 6** if zero | DB-derived + **E** |
| On break | `Status==Away`; fallback **2** | DB + **E** |
| Offline | Unreachable (`UserStatus` lacks Offline) | ⚫ |
| Longest queue wait | Oldest *open* case age; default **38 min**, label text hard-coded "above 15m target" | Calculated + **E** |
| AHT | Avg of (`ResolvedAt − CreatedAt`) today; default **372 s**; delta **−40 s** constant | Calc + **E** |
| Occupancy | `openCases / (online×2.5)` clamped **60–95 %**; default **78 %** | Calculated (arbitrary) + **E** |
| Queue health (5 channels) | Fixed channel list & capacities; `waiting = count>0 ? count : DefaultWaiting` | **E** |
| Handled today / CSAT | `GetHashCode()` of name | **E (pure mock)** |
| SLA-at-risk | Calendar-based % vs internal due (formula #5) | Calculated |
| Nudge | Real notification + audit row; **no authorization** | 🟡 |

Refresh: 8 s polling × 4 requests, no visibility pause, no overlap guard, swallow errors after first load (stale data displayed with no indicator). No team/queue filter. Status: ⚫ **Hard-Coded / Mocked** (partially real).

## 12. Notification Audit

Lifecycle: **create** (`CreateNotificationAsync` on assign/status/escalate/reminder; 5-min de-dup) → **store** (`Notifications`, indexed, partial unread index) → **retrieve** (`GET` paginated; the call also triggers the SLA scan) → **badge** (`unread-count`, 8 s visibility-aware polling + chime) → **read / read-all / delete** (scoped by `RecipientUserId` ✔). Real, DB-backed, polling (no push). Gaps: SLA alerts depend on the list call (B-13); a second SLA formula (B-06); policy constants hard-coded; config-change broadcast to anyone with role containing Admin/Officer/Agent; no per-user preferences; no retention/cleanup.

## 13. Performance Audit

**Backend start-up delay (evidence):**
1. `Program.cs:160-679`: `EnsureCreated` → ~90 sequential `ExecuteSqlRaw` (each is a network round-trip to Neon; several are `CREATE EXTENSION`, `DROP … CASCADE`, large `DO $$` blocks) → index bootstrap → collaboration table → `pg_trgm` → sequence → **`DbSeeder.Seed`** (≈15 `Ensure*` passes; each loads data such as *all* `SlaConfigurations`, **all cases with null due-dates**, all users).
2. `DbSeeder.EnsureSlaAndEscalationMatrix` / `EnsureFirstResponse…` iterate cases to backfill (`ToList()` of all matching).
3. Neon pooler/scale-to-zero cold start: `backend.log` shows commands failing at **52.5 s** and **30.0 s** then EF retry (`EnableRetryOnFailure` 5 × up to 10 s) — worst-case start can exceed a minute; Render health check `/health` is mapped only **after** this block completes (so the first request waits too).
4. Swagger/OpenAPI generation, `AddValidatorsFromAssemblyContaining` (reflection) — minor.

**First-run empty / second-run populated dashboard — Root cause analysis**
- **Evidence A (frontend bootstrap):** `AppContext.jsx:8-10` writes `DEFAULT_USER_ID` (a literal GUID from the author's DB, `constants/index.js:9`) into `localStorage` if empty. `Dashboard`, `Header`, `Create*` etc. fire immediately on mount and never wait for `AppProvider`'s `getAllUsers()` result. `UserAuthorizationMiddleware` returns **401** for an unknown GUID. Only `GET /api/users` is exempt, so `AppProvider` succeeds, replaces `localStorage` with `users[0]`, but the Dashboard's already-failed requests are not retried.
- **Evidence B (error handling):** `DashboardPage.jsx:154-156` catches and logs only; `summaryData` stays `null` → `metrics` zero object with `slaAdherencePct:'100'` → looks like "no data".
- **Evidence C (backend readiness):** The 15 s axios timeout (`api.js:14`) is shorter than the observed start/cold-DB delay; the first request(s) time out while the host is still bootstrapping (B-03).
- **Impact:** First load shows zeros/"100 %", second load (valid GUID in storage, DB warm) shows data.
- **Fix:** (1) remove hard-coded GUID, bootstrap user *before* rendering routes; (2) readiness probe (`/health`) before first data call; (3) error + retry UI, never default to "100 %"; (4) move DDL/seed out of app start; (5) raise cold-start tolerance or use a non-scale-to-zero DB. *Caveat: which of A/C dominates on your machine depends on whether your local DB's Siti GUID equals the constant — I could not verify that without running it.*

**Other hot spots:** `TeamService` (B-19), Team Monitoring (B-20), per-card timers (B-21), CreateCase 8-request open, `GetUsersAsync` unbounded (no paging; loaded 2×), notification list triggers scan, `ResolveEscalationTarget` loading all users, `GetDashboardSummaryAsync` per-row SLA loop, `AddDbContextPool` + scoped services holding per-request cache fields (`PiiMaskingService._cachedConfigs` is effectively per-request, so its 5-min "cache" never caches).

## 14. Code Quality & Reusability

- Duplicate: **SLA logic ×4**, drawer shell ×6, masking ×2 (frontend/backend, divergent), priority resolution (frontend map + backend), user-resolution LINQ in 3 strategies (`teamMembers ∪ directUsers` copy-pasted), `RecordAuditLogAsync` in `TeamService`, `RoutingEngineService`, `ConfigurableSettingsService`, `DepartmentService`, inline audit blocks in `SlaRoutingService` (extract `IAuditLogger`).
- God classes/components listed above.
- Over/under-abstraction: strategy pattern is good; however `CaseService` takes **optional** (`= null`) dependencies (`_slaRoutingService?`, `_routingEngine?`) creating dead `else` branches (`ResolveSeverityAsync`, `GetSlaTargetHoursAsync` fall-backs) that mask the real code path.
- Inconsistent enums vs strings: `CaseStatus` enum, but severity/type/channel/`FirstResponseStatus`/`SubcaseType` are strings.

## 15. Unnecessary Files / Code

| File | Purpose | Used? | Recommendation |
|---|---|---|---|
| `tests/**/bin`, `obj` (140 tracked files, incl. `appsettings*.json` with secret) | Build output | No | **Remove + gitignore + rotate secret** |
| `backend/backend.log` | Runtime log | No | Remove, ignore |
| `backend/Uploads/Attachments/*` (7 files) | Test uploads | No | Remove, ignore |
| `.DS_Store` | OS file | No | Remove |
| `backend/Migrations/*` | EF migrations | **Never applied** (`EnsureCreated`) | Refactor: make authoritative or delete |
| `Models/CaseCollaborationActivity`, `LinkedCase`, `CaseChildRelation` | Features | Used | Keep |
| `SlaConfigurations` + `GetSlaConfigurationsAsync` paths in `CaseService` | Legacy SLA | Only legacy fallbacks / Settings screen | Refactor/Remove (B-05) |
| `CaseService.ResolveSeverityAsync`, `GetSlaTargetHoursAsync` fallback, `GetFirstResponseTargetMinutesAsync` | Fallbacks for null services | Effectively dead (DI always supplies services) except `AssignCaseAsync` | Remove |
| `CaseStatus.Accepted/Rejected/Pending` | Enum values | No transition path | Investigate / remove |
| Frontend unused API methods (see §5.8) | | No | Remove or wire |
| Customer-360 Products/Timeline/Transaction/Referral components + CSS | UI | Rendered but no data source | Remove or rebuild |
| `/team-monitor`, `/audit-logs`, `/field-settings` duplicate routes | Aliases | Possibly bookmarks | Keep until verified |
| `@originjs/vite-plugin-federation` | Module Federation | No remotes | Remove until needed |
| `backend/CaseManagement.Api.http` | Dev requests | Dev only | Keep |
| `DbSeeder.cs` FixInfinityDates / Passport / Account seeders | One-off fixes | Run every boot | Move to one-off scripts |

*(I verified reference counts for frontend files programmatically; nothing here was deleted.)*

## 16. Positive Findings (preserve these)

1. **Case-number allocation via a Postgres sequence** (`SchemaConstants.CaseNumberSequence`) with a safe fallback — correct, race-free pattern.
2. **SLA snapshotting at creation** (targets, due dates, `SlaConfigVersion`) — correct way to decouple historic cases from later config changes.
3. **Backend-authoritative priority resolution** — frontend preview is advisory; server recomputes.
4. **Business-time calendar service** with holidays/weekends/time-zone and clear boundary handling.
5. **Strategy pattern for assignment** (`IAssignmentStrategy` via DI) and an **ordered, JSON-condition routing-rule engine** with audit logging — the right shape for extension.
6. **No team-ID hard-coding in the engine** — adding a team requires no engine change.
7. **Execution-strategy–aware transactions** (works with `EnableRetryOnFailure`).
8. **Query discipline:** `AsNoTracking`, projection mappers, DB-side pagination, `react-window` virtualisation, keyset-friendly indexes, `pg_trgm`, partial/unique/expression indexes, `SqlSearchPattern` escaping for search.
9. **Config-change audit trail** (old/new values) into `CaseEvents`; correlation-ID middleware; options-pattern tunables (attachments, search, cache).
10. **Defensive upload validation** (size, extension allow-list + deny-list, GUID storage name, `Path.GetFileName`).
11. **Customer validation depth** (Malaysian NRIC structure/DOB match, unique partial indexes, duplicate checks with DB-constraint fallback).
12. **Unsaved-changes modal in Settings** and the **`maskUtils` module** are good patterns worth generalising.
13. **Frontend structure:** lazy routes, service/hook separation, single axios instance with error normalisation, visibility-aware polling for the badge.
14. **Test project exists** with meaningful unit cases (NRIC, attachments, status transitions, masking, transaction safety).

---

# Final Architectural Recommendations

### A. Must Fix (correctness / security / integrity)
1. Rotate the Neon credential; purge from history; untrack `bin/obj`, logs, uploads. (B-02)
2. Real authentication + role-based authorization on every endpoint; remove open user list/creation. (B-01)
3. Server-side masking for **all** fields marked sensitive incl. `IdValue/Passport/AccountNumber`; single masking implementation. (B-14)
4. Make **one** SLA clock service; fix pause/reassign semantics and due-date shifting; stop auto-escalating paused cases. (B-06, B-07)
5. Resolve the severity/priority duplication; allow configured severities end-to-end or remove the master-data UI. (B-05)
6. Escalation: structured, executable trigger fields in the UI; honour `IsActive`; remap cases on level deletion; delete the fake local fallback. (B-08)
7. Validate case/customer input against the configuration tables; honour `IsRequired`. (B-09, B-10)
8. Dashboard bootstrap/readiness/error-state fix. (B-04)

### B. Should Fix (maintainability / scalability)
- Replace startup DDL/seeder with real migrations + separate prod bootstrap vs dev seed (B-03, B-24).
- Single team-membership source; per-queue assignment config; capacity in all strategies; transactional, locked assignment (B-11, B-12).
- Key priority mappings by sub-category id (B-17).
- Emit SLA notifications from the worker/events (B-13).
- Remove mock metrics; add team dimension to monitoring (B-15).
- Remove/rebuild Customer-360 dead tabs (B-16).
- Central `SideDrawer` + `useUnsavedChangesGuard` (B-18).
- Split `CaseService`, `ConfigurableSettingsPage`, `CasesSlaRoutingPage`.
- Object storage for attachments (B-22); tighten CORS/Swagger (B-23).

### C. Optimisation Opportunities
- Aggregate in SQL for Team Monitoring/Dashboard/Teams (B-19, B-20); one metadata endpoint + client cache; shared 1 Hz ticker; cache calendar & escalation config with invalidation; batch `ResolveEscalationTarget` queries; `jsonb` for rule conditions; page `/api/users`.

### D. Future Architecture
- Queue/Skill/Role entities; SignalR/SSE for notifications & wallboard; outbox for notifications; leader-elected worker (or Hangfire/Quartz); multi-tenant timezone/calendar per queue; custom-field storage for cases (`CaseCustomAttribute`) and a generic metadata-driven form/validation engine (`FieldDefinition + ValidationRule → GenericValidator`, shared JSON schema for FE/BE).

---

# Prioritised Action Plan

| Phase | Item | What | Why | Where | Expected result | Dependencies | Risk |
|---|---|---|---|---|---|---|---|
| **1 Critical** | 1.1 | Rotate DB creds, scrub history, untrack artefacts | Secret exposure | repo, Neon | No credential in VCS | Access to Neon/Render | Low |
| | 1.2 | AuthN/Z (JWT/OIDC + policies) | Anyone can be anyone | middleware, controllers, FE api.js | Real identity | Identity provider decision | **High** (cross-cutting) |
| | 1.3 | Server-side masking for all sensitive fields | PII leak | `PiiMaskingService`, DTO mappers | API never returns raw sensitive values | 1.2 for unmask roles | Low |
| | 1.4 | Dashboard/bootstrap fix | First-run bug | `AppContext`, `api.js`, `DashboardPage` | Deterministic first load | — | Low |
| **2 Integration** | 2.1 | Unify SLA (`SlaClock`) + fix pause/reassign | Contradictory results | `CaseService`, `NotificationService`, dashboard, FE util | One truth | 4.x data backfill | Medium |
| | 2.2 | Wire config to behaviour: required flags, severities, case types, channels, escalation triggers | Config ≠ runtime | validators, escalation UI/service | Config is source of truth | Phase 3 design | Medium |
| | 2.3 | Notifications from worker/events | Missed alerts | `NotificationService`, worker | Timely alerts | 2.1 | Medium |
| | 2.4 | Remove/mark dead UI (Customer-360 tabs, unused API methods) | Honest UI | FE | No fake tabs | — | Low |
| **3 Configurability** | 3.1 | Team/Queue/Skill/Role model; per-queue algorithm & capacity; skills UI | Team 7 works end-to-end | Models, engine, Teams UI | New team fully functional | Migrations | **High** |
| | 3.2 | Sub-category-id keyed priority/SLA; lifecycle/dependency checks | Orphans | SlaRouting, Settings | Referential integrity | 3.1 | Medium |
| | 3.3 | Metadata-driven field validation engine (FE+BE) incl. custom case fields | Extensible forms | Field config, `Case` custom attrs | New fields without code | 2.2 | Medium |
| **4 Performance** | 4.1 | Real migrations; remove startup DDL/seed | Slow boot | `Program.cs`, `Migrations/` | Fast, deterministic start | 1.1 | Medium |
| | 4.2 | SQL aggregation for Teams/Monitoring/Dashboard; caches; shared ticker | Scale | Services, FE | Flat latency vs data | — | Low |
| **5 Refactor** | 5.1 | Split `CaseService` & mega-components; `SideDrawer`; `useUnsavedChangesGuard`; `IAuditLogger` | Maintainability | BE/FE | Smaller units | — | Low-Med |
| **6 Hardening** | 6.1 | Object storage, CORS/Swagger, rate limiting, structured logging/metrics, retention, backup, integration tests on real Postgres, leader election | Enterprise ops | infra | Prod-grade | 1.2 | Medium |

---

# 40 — "If this were handed to a real enterprise customer tomorrow…"

**What would break first**
1. **Security review:** no authentication — any person with the URL can open `/api/users`, copy a GUID and act as any user, including creating privileged users and rewriting SLA/routing/escalation. The live DB password is also in git.
2. **Cold start / first impression:** the first load after a deploy (Render free + Neon scale-to-zero) takes ~30-60 s+ because the API runs ~100 DDL statements and a 1,500-line seeder before serving; the dashboard then shows zeros/"100 %".
3. **Trust in numbers:** Team Monitoring displays invented values (hash-based CSAT/handled counts, default occupancy/wait) next to real ones; Dashboard, cards and the escalation worker disagree about whether a case is breached.
4. **Data protection:** ID values are returned unmasked by the API even if "sensitive/masked" is configured.

**What would become difficult to configure**
- Adding a severity, case type or channel (UI accepts it, creation rejects it); making a field optional (still mandatory); new escalation level with a threshold other than 70 %; a new team that can actually receive cases (needs sub-categories, priority mappings, escalation roles, skills — most have no UI); per-team algorithm/capacity; skills; queues; business hours per team/time-zone.

**What is currently dependent on hard-coded assumptions**
Malaysia/MYT time zone; Contact Center `"CC"` fallback; four priority names; role-name substrings (`Lead`, `Supervisor`, `Head`) for escalation; seeded user GUID in the frontend bundle; skill keywords; channel and case-type lists in validators and UI; Customer-segment values in routing rules that no longer exist in data.

**Architectural changes required before "enterprise-ready"**
Real identity + RBAC; migrations instead of startup DDL; a single SLA clock and single priority/severity model; a proper Team/Queue/Skill/Role model with transactional, capacity-aware assignment; structured escalation triggers; metadata-driven validation/masking applied uniformly server-side; event-driven notifications from the worker; real metrics for monitoring; object storage; observability and integration tests against real PostgreSQL.

**Balanced view:** the foundations (sequence-based numbering, SLA snapshots, business-calendar, strategy-based routing, DB-side paging, audit trail) are sound and worth keeping — most of the work is *connecting configuration to behaviour and removing duplicates/mocks*, not a rewrite.

---

*Audit performed read-only. Awaiting your approval/prioritisation before any change is made.*
