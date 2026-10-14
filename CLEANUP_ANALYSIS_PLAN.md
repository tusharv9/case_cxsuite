# Cleanup, team architecture, SLA migration, monitoring, assignment UI and transfer — Phase 0 analysis and plan

Status: **analysis only (2026-10-14). Nothing has been changed for this request.**
Evidence: the repository and read-only queries on the shared (Neon) database. Labels used below: **[V]** verified, **[A]** assumption,
**[?]** unknown.

---

## 0. Starting point: what is already done

The workbook reconciliation was approved and applied **today** (see `WORKBOOK_RECONCILIATION_PLAN.md`). Several items in the request
are therefore already in place, and the plan below builds on them rather than redoing them.

| Request item | State today |
|---|---|
| Excel = source of truth for categories / sub-categories / SLA | **[V] Done.** 11 active teams = the 11 workbook categories; 64 active sub-categories with workbook ID (`Code`), description and default priority; SLA matrix 1/2/4/8 h response, 4/24/48/120 h resolution. Re-verified row by row. |
| Category ↔ Team ↔ Department mapping | **[V] One record.** Department and Team are the same table (`Departments`), so category = department = team. |
| "Premier Segment", "Fast-Lane", "Sales Pursuit Desk" | **[V] These are not teams.** "Premier Segment Fast-Lane" and "Sales Pursuit Desk" are **routing rules**, both inactive since today. The team is "Sales Pursuit" (SP), inactive since today. No other spelling or duplicate exists in the database. |
| Obsolete master data | **[V] Deactivated, not deleted:** 3 teams (SP, Campaign Studio, Marketing Team), 2 routing rules, 15 sub-categories. The request now asks for **deletion** — section 3. |
| Team Monitoring hardcoded | **[V] Already database-driven** (section 6). A few definition and labelling gaps remain. |
| Transfer | **[V] Exists** as a case action with backend rules. There is **no** transfer configuration (section 8). |

Build and test baseline (run today, after the workbook change): backend **371/371** tests pass on PostgreSQL; frontend build OK; lint
75 warnings (unchanged).

---

## 1. Repository and architecture summary [V]

- **Backend:** ASP.NET Core (net10.0), EF Core 10 with Npgsql (PostgreSQL), controllers → services → repositories.
  - EF migrations run on startup (`Database:MigrateOnStartup`).
  - Seeding is versioned (`SeedHistory`).
  - The SLA monitor (`SlaMonitorService`, background) runs the escalation matrix.
  - Host integration: Standalone mode (dev user picker via `X-User-Id`) or Host mode (identity and permissions from the Host; users
    are projected and provisioned into `Users`).
- **Frontend:** React 19 + Vite 8 (JavaScript); shared components (`Select`, `Modal`, `SideDrawer`, `DynamicField`); blue design
  tokens in `variables.css`.
- **Data model** (relevant parts):

| Entity | Notes |
|---|---|
| `Departments` (= teams) | `Name`, `Code` (unique), `OwnerId` = team lead, `IsActive` |
| `TeamMembers` | the **only** membership source (`IsAssignable`, `MemberRole`, `IsActive`) |
| `Users` | name, email, `Role` (free text from Host / seed), `Status` (self-set: Available / Busy / Away / Offline), legacy `DepartmentId`, `Team`, `Queue` |
| `DepartmentSubCategories` | `Code` = workbook ID (unique), `Description`; `PriorityCategoryMappings` → `PrioritySlaRules` |
| `Cases` | `DepartmentId` (FK), `OwnerId`, **`Subcategory` and `Severity` as text**, SLA snapshot (`*TargetMinutes`, `*DueAt`, `SlaConfigVersion`, pause and breach fields), `CurrentEscalationLevel` |
| `RoutingRules` | conditions as JSON text, `TargetDepartmentId` (Restrict) |
| Other | `AssignmentConfigurations` (algorithm and capacity, global or per team), `ManualAssignmentSettings` (+ cross-team list), `TeamAssignmentPointers`, `EscalationLevelConfigs`, `CaseEvents` (case history **and** configuration audit) |

- **Foreign keys that matter for deletion** [V]:
  - `Cases.DepartmentId → Departments` is **ON DELETE CASCADE**. A raw delete of a team would delete its cases. The app's own
    "delete team" refuses when cases exist, but the schema itself does not protect them.
  - `TeamMembers`, `DepartmentSubCategories`, `AssignmentConfigurations`, `TeamAssignmentPointers` and `ManualAssignmentCrossTeams`
    cascade from `Departments`.
  - `RoutingRules.TargetDepartmentId` is Restrict.
  - `Users.DepartmentId` is optional and not cascaded, so it blocks deletion while referenced.

---

## 2. Current state (database) [V]

### Teams and people

| Team | Lead | Members | Open cases |
|---|---|---|---|
| AC Accounts | Nurul Aisyah | 5 | 4 |
| CF Complaints & Feedback | David Tan Sri | 5 | 6 |
| FD Fraud & Disputes | Kavitha Raj | 5 | 16 |
| IN Investments & Insurance | Amirul Hakim | 5 | 0 |
| LN Loans | Aisha Sazlina | 10 | 38 |
| CD, DS, PT, DB, BA, KC (new) | **none** | **0** | 0 |
| SP Sales Pursuit (inactive) | Grace Wong | 6 | 0 |
| CS Campaign Studio, MT Marketing Team (inactive) | — | 1 each | 0 |

- **All 30 users are development sample records** (`@bank.com`) created by the seed step `development.users-and-departments.v1`.
  None comes from the Host.
- **Exclusive to an obsolete team:** Benjamin Tan, Noraini Kassim and Tariq Aziz (SP only; no cases owned). Everyone else belongs
  to at least one active team.
- **People in several teams:** Amirul Hakim (IN, LN, plus inactive CS), Farid Rahman (AC, LN), Siti Hajar (AC, LN), Grace Wong
  (LN, plus inactive SP), and others.

### Cases

- **78 cases: 64 open, 14 resolved.** Every open case is past its resolution due date (breached under the current snapshots).
- 4 cases are paused; open cases were created between 2026-09-24 and 2026-10-12.
- **None of the 64 open cases uses a workbook sub-category.** They still carry pre-workbook values:
  - LN: "General Inquiry" × 38;
  - FD: "Fraud" × 8 and 6 others;
  - CF: "Card Dispute" × 3 and others;
  - blank × 4.

  Titles show the old classification is unreliable. For example "Account locked…", "Credit card annual fee waiver…" and "ATM cash
  withdrawal failed…" are all in Loans as "General Inquiry". Several are test records ("E2E Test High Case", "Test Case – Security
  Incident").
- **SLA snapshots are mixed:** versions 1–16, and e.g. case C-01210 is Critical with High-style targets (60/360/480 min).

### Escalation matrix (affects ownership)

| Level | Trigger | Receives the case | Moves ownership |
|---|---|---|---|
| 1 | 70 % of SLA | the owner | no |
| 2 | 90 % of SLA | role "Team Lead" | **yes** |
| 3 | breached | role "CX Supervisor" | **yes** |
| 4 | breached + 12 h | role "Head of Customer Experience" | **yes** |

- The target is found by **matching the `Users.Role` text**, preferring the legacy `Users.DepartmentId`. It does **not** use the
  case's team lead or members.
- So level 2 for a Fraud & Disputes case goes to a user whose role is literally "Team Lead" (Amirul Hakim, Grace Wong or Nurul
  Aisyah), not to Kavitha Raj (role "Fraud Investigation Lead").
- Levels 3 and 4 move cases to Amina Al-Mansoor and David Tan Sri, outside the case's team. This is why case C-01226 is held outside
  its team.
- **Any reassignment of breached cases would be undone by the next escalation** unless this is addressed first.

---

## 3. Obsolete master data — deletion analysis

The request asks for physical deletion where safe. Dependency check per record [V]:

| Record | Depends on it | Can be deleted safely? | How |
|---|---|---|---|
| Team **Sales Pursuit** (SP) | 6 memberships, 2 retired sub-categories (0 cases), its routing rule, 3 users' legacy `DepartmentId`; 0 cases | **Yes** | delete rule "Sales Pursuit Desk"; clear the 3 users' legacy `DepartmentId`; delete the team (memberships and sub-categories cascade) |
| Team **Campaign Studio** (CS) | 1 membership; 0 cases, rules or settings | **Yes** | delete (membership cascades) |
| Team **Marketing Team** (MT) | 1 membership; 0 cases, rules or settings | **Yes** | delete |
| Routing rule **Premier Segment Fast-Lane** | nothing | **Yes** | delete |
| Routing rule **Sales Pursuit Desk** | nothing | **Yes** | delete |
| **15 retired sub-categories** (incl. SP's 2) | priority mappings (cascade); **cases refer by text only** — 64 open and 14 resolved keep the old text | **Yes, technically**; history keeps the text | delete after Phase 3 recategorises the open cases, so no open case points at a value that no longer exists anywhere |
| Users Benjamin Tan, Noraini Kassim, Tariq Aziz | memberships in SP only; 0 cases; audit events may name them | **Deactivate, don't delete** (recommended) | audit history (`CaseEvents.UserId` FK) must keep resolving; deactivated users get no work and are hidden from pickers |

- Audit and history: configuration audit events and case events store names as text and stay readable after deletion. No compliance
  record is deleted.
- Each deletion is itself recorded as an audit event.
- **Safety prerequisite:** change `Cases.DepartmentId` from CASCADE to **RESTRICT** (schema migration) before any team deletion, so
  no future delete can take cases with it.

**Hardcoded or seeded references to the old structure** [V]:

| Where | What | Proposal |
|---|---|---|
| `DbSeeder` development steps (users and departments, team memberships, sample sub-categories and mappings, teams and squads, routing rules and skills, skill rules) | create Contact Center, Micro Finance, Fraud Operations, Service Desk — Retail, Sales Pursuit, Premier Banking Squad, the "Priority segment fast-lane" rule, 30 sample users and the old sub-categories — on any new database seeded in Development mode | retire these steps. They never run again on the shared database (recorded in `SeedHistory`), but they would recreate the obsolete structure on any fresh environment. Sample customers can stay if wanted (D3). |
| `appsettings.json` (base, all environments) | `Database:Seed = "Development"` | set the base value to `Bootstrap`; keep `Development` only in `appsettings.Development.json` |
| `CaseDrawer.jsx:898` | `departmentName \|\| 'Contact Center'` fallback | show "—" |
| `TeamsPage.jsx:96` | subtitle "…cases, sales pursuit and campaign delivery" | neutral text |
| `TeamMonitoringService` | role fallback "Service Agent" | show "—" |

Not found anywhere [V]: backend enums or constants of team names, mock API responses, hardcoded agent arrays in the frontend.

---

## 4. Target architecture

- **Team = Department = workbook category: one `Departments` row each, as today.** Splitting them would create two sources for the
  same thing; no requirement needs it.
- **People:**
  - `Users` stays the single identity table.
  - `TeamMembers` stays the single membership source.
  - `Departments.OwnerId` stays the team lead.
  - The legacy `Users.DepartmentId`, `Users.Team` and `Users.Queue` columns are retired:
    1. stop reading `Users.DepartmentId` (escalation, co-worker picker, delete guard, DTO);
    2. drop all three columns (destructive; separate approval).
- **Local people management, Standalone mode only:**
  - a minimal admin API and screen to create, edit and deactivate a user (name, email, role);
  - team membership and lead are managed on the existing Teams page;
  - in Host mode this is switched off, because the Host provisions users through the existing projection;
  - no second user store.
- **Escalation targets** become team-aware:
  - "Team Lead" = **the case's team lead** (`Departments.OwnerId`);
  - for supervisor and head roles, a per-level choice of whether ownership moves at all (D7).
- **Transfer** gets its own policy configuration, separate from execution (section 8).

---

## 5. Phase plan (recommended order differs slightly — see the note at the end)

### Phase 1 — Excel reconciliation: done; remaining cleanup

- Deliverables already produced: mapping, final structure and verification (`WORKBOOK_RECONCILIATION_PLAN.md`).
- Remaining: the deletion list in section 3. It is executed in Phase 2 (teams and rules) and Phase 3 (sub-categories, after the
  cases are recategorised).

### Phase 2 — Team and agent architecture cleanup

1. **Migration `CasesDepartmentRestrict`:** cascade → restrict on `Cases.DepartmentId`.
2. **Delete obsolete records**, one transaction, audited:
   - teams SP, CS and MT;
   - rules "Premier Segment Fast-Lane" and "Sales Pursuit Desk";
   - clear 3 legacy user links;
   - deactivate the 3 SP-only users (D2).

   Dry run → approval → apply, via a `--cleanup-obsolete` command (same pattern as the earlier reconciliations).
3. **Stop reading `Users.DepartmentId`.**
   - Escalation: the "Team Lead" role means the case's team lead; other roles keep the role match, scoped by team membership first.
   - Co-worker picker: uses membership.
   - Team delete guard: uses membership.
4. **Local people management** (Standalone only): `POST/PUT /api/users`, deactivate; a "People" section on the Teams page; new
   permission `users.manage`.
5. **Staff the 6 new teams with the people you name** (D1). No invented employees.
6. **Seed cleanup:** retire the old-structure development steps; set the base `Seed` to `Bootstrap`.
7. Fix the hardcoded text listed in section 3.
8. **Later, destructive, separate approval:** drop `Users.DepartmentId`, `Team` and `Queue`.

Tests: deletion refuses when cases exist; restrict FK; escalation goes to the case's own team lead; user management disabled in Host
mode; the full suite.

### Phase 3 — Case recategorisation, SLA migration, reassignment (bulk; specific approval required)

**3a. Recategorisation of the 64 open cases (manual decision).**
- There is no deterministic mapping from old values to workbook sub-categories: 38 "General Inquiry" cases span loans, cards, ATM and
  digital-banking topics.
- Proposal:
  - export a review sheet (case number, title, current team and sub-category, priority, status, owner);
  - you fill in the workbook sub-category ID per case; I can pre-fill **suggestions** from title keywords, clearly marked;
  - a command imports the approved sheet;
  - cases with no decision stay as they are and are listed.
- **Test records** (e.g. "E2E Test…", "Test Case…"): your call to resolve or close them instead of migrating (D5).

**3b. Priority.** When a case gets a workbook sub-category, its priority becomes that sub-category's default (D6). The alternative
is to keep its current priority.

**3c. SLA migration matrix.**

| Case state | Count now | Proposed treatment |
|---|---|---|
| Open, running (Open / InProgress / Escalated, not paused) | 60 | new targets of its (new) priority, **measured from the original SLA start** (business time, paused minutes kept): due dates and breach state recomputed. The clock is **not** restarted. Old and new values go into an audit event per case. |
| Paused (Waiting on customer or paused) | 4 | same targets; due dates recomputed; the pause continues and the existing resume logic adds the paused time |
| First response already given | — | actual time kept; target updated for reporting |
| Previously breached, now within target under the new policy | **[?]** (counted by the dry run) | breach flag cleared, previous breach time kept in the audit event (D8) |
| Escalation level reached | — | kept; no rollback. Future escalations evaluate the new targets. |
| Resolved / Closed (14) | 14 | **unchanged** (completed measurements are history) |

- Alternative "from migration time" = a clock reset. Not recommended.
- The `SlaConfigVersion` of migrated cases becomes the current version (17).

**3d. Reassignment.**
- A case moves team only when its new sub-category belongs to another team (a recorded transfer).
- Within its team, the team's own algorithm picks an eligible, available agent below capacity; otherwise the lead holds the case;
  otherwise the case goes to the exception list.
- **Prerequisites:**
  - Phase 2 escalation fix (otherwise the SLA monitor moves breached cases again);
  - staffed teams.

**Impact counts.** Each step gets a dry run listing: deterministic moves; cases needing a decision; transfers between teams; agents
chosen; breach-state changes. Today's exact numbers depend on decisions D5 and D6 and on your recategorisation sheet.

**Rollback.** One transaction per step; every changed case has an audit event with the old team, owner, sub-category, priority and
SLA values; a pre-run export of the affected columns.

### Phase 4 — Team Monitoring (already database-driven; finish the definitions)

Metric → source [V]:

| Metric | Source today | Gap / proposal |
|---|---|---|
| Total / online / break agents | active members of active (or the chosen) teams; status = `Users.Status` (self-set) | label status as **self-reported**. There is no presence or heartbeat, so "online" is not inferred from login. Optional (D9): last-status-change time, to show staleness. |
| Workload per agent | open cases owned / capacity (team or global config) | OK |
| Occupancy | open cases of online agents ÷ their capacity | this is **case-load utilisation**, not time-based occupancy: rename it or add a definition tooltip. Targets come from configuration. |
| Queue health | per configured source channel: open, waiting for first response, breached, oldest wait | OK. "Queue" = channel; add a **per-team** view (D10) |
| SLA at risk | SLA clock verdicts | OK |
| Resolved today / average resolution | `ResolvedAt` in the business time zone | OK |
| Total Teams, Escalated cases, per-team workload (open, waiting, escalated, breached, held by lead, members online) | **not shown** | add to the same overview endpoint, computed server-side from the same queries |

- Already in place: loading, error and stale states; a refresh that pauses when the tab is hidden; no stacking of requests.
- Remove the "Service Agent" role fallback.

### Phase 5 — Assign / Reassign UI

There is no separate "assign page" today [V]. Assign, Transfer and Escalate are **modals** opened from the case drawer or list.

Reassign today:
- eligible people of the case's team (plus allowed cross-team), searchable inside the dropdown;
- ineligible people are shown disabled with the reason;
- the chosen person's preview card (status, role in team, workload);
- a configured reason, with "Other" → explanation.

| | Option A — compact assignment workspace (in the existing modal) | Option B — assignment side panel |
|---|---|---|
| Layout | header strip with the case context (number, team, sub-category, priority, SLA remaining, current owner); two columns: **current → proposed**; one searchable agent list with status and workload inline; reason; confirmation line | a panel docked inside the case drawer with the same content and the case still visible |
| Fit | reuses `Modal`, `Select`, `ReasonFields`; least change | the case drawer is already a side drawer, so a second panel stacks two drawers or needs a new layout mode |
| Recommendation | **A** | B only if you want a dedicated bulk "work queue" page — a new feature (D11) |

Text wireframe (Option A):
```
Reassign case C-01227                                             [x]
Fraud & Disputes · FD-01 Unauthorised transaction · Critical · SLA 1h 20m left
Current: Kavitha Raj (Team Lead)        →  Proposed: [ Search agent… ▾ ]
                                           Natasha Lim · Available · 2/5
                                           Adam Haris  · Busy · 4/5
                                           Wong Siew Kee · Away (not eligible)
Reason [ Workload rebalancing ▾ ]   (Other → explanation required)
-------------------------------------------------------------------
"Natasha Lim will own this case; the SLA clock is unchanged."  [Cancel] [Reassign]
```

Team change stays a **transfer** (Phase 6), not part of reassign.

### Phase 6 — Configurable Case Transfer

**Definitions** (as implemented today [V]):
- **Assign / Reassign** = change the owner **within** the case's team (plus configured cross-team helpers); the case stays in its
  team.
- **Transfer** = move the case to **another team**. The receiving lead (or the team's algorithm) takes it, with a configured reason,
  and the SLA clock continues.

Gaps:
- no rule on which team may transfer to which;
- no choice of receiving agent;
- the case **keeps the old team's sub-category**, which is invalid for the new team;
- no approval step.

**Configuration (admin page "Transfer rules", Configurable Settings tab, `config.manage`):**

| Field | Proposal |
|---|---|
| Name, active, order | yes |
| Source teams | any, or a selected list |
| Destination teams | selected list (only active teams) |
| Sub-categories in scope | optional filter |
| Reasons | subset of `TRANSFER_REASON` (empty = all) |
| Allowed case statuses | e.g. Open, InProgress, Escalated, WaitingOnCustomer |
| Receiving owner | `Lead` (today) / `TeamAlgorithm` / `ChooseAgentRequired` / `ChooseAgentOptional` |
| Sub-category on transfer | **must choose one of the destination team's sub-categories** (recommended), or keep with a warning |
| Priority on transfer | keep (SLA continues), or take the new sub-category's default (D12) |
| SLA | **continues** (no reset). Recalculation only if the priority changes, from the original start, as in 3c. |
| Notifications | receiving owner and lead (today); optionally previous owner and team members |
| Approval required | **not proposed now.** It needs a pending-transfer state, an approver queue and SLA behaviour while pending; separate approval. |
| No matching rule | behave as today (any active team), or deny (D13) |

**Data model:** `TransferPolicies` (+ join tables `TransferPolicySourceTeams`, `TransferPolicyDestinationTeams`,
`TransferPolicySubCategories`, `TransferPolicyReasons`), the same pattern as `ManualAssignmentCrossTeams`. Versioned save (409 on
stale).

**API:**
- `GET/POST/PUT/DELETE /api/transfer-policies` (`config.manage`);
- `GET /api/cases/{id}/transfer-options`: allowed destination teams, their sub-categories, receiving-owner mode, eligible agents when
  selection is allowed, reasons;
- `PUT /api/cases/{id}/transfer` gains `subCategory`, an optional `ownerId`, and server-side policy enforcement (422 with a code
  when not allowed).

**Permission:** today a transfer needs the case holder, the team lead or `cases.assign`. Optional new permission `cases.transfer`
(D14).

**Transaction:** team, owner, sub-category (and priority, if chosen) and the history event change in one transaction under the team
assignment lock. A double submit is harmless: a second transfer to the same team is refused.

**UI:** the Transfer modal shows the case context, the allowed destinations only, then the destination sub-category, the receiving
owner (per policy), the reason and a summary of the SLA and ownership effect.

### Phase 7 — Integration, testing, verification

- **Backend integration tests on PostgreSQL** for every phase:
  - deletion and restrict;
  - escalation targets;
  - user management (Standalone / Host);
  - recategorisation import;
  - SLA migration matrix (each state);
  - reassignment eligibility;
  - monitoring metrics against seeded test data;
  - transfer policy enforcement (allowed, denied, agent choice, sub-category).
- **Rehearsal** of every data step on a fresh copy of the shared database, then dry run → apply → read-back verification.
- **Builds:** backend, frontend and lint; browser walkthroughs of the changed screens (no frontend test framework exists — Vitest
  needs approval).
- **Deployment:** migrations auto-apply on start; restart the backend after data steps (in-memory configuration cache).
- **Rollback:** per-step exports and audit trail; `dotnet ef database update <previous>` for the schema.

**Recommended order:**
1. Phase 2 (structure, escalation fix, people);
2. Phase 3 (needs staffed teams and the escalation fix);
3. Phases 4, 5 and 6, which are independent of the data work and can run in any order;
4. Phase 7 throughout.

---

## 6. Risks and dependencies

1. **No real people exist yet.** Every user is sample data, and 6 teams are empty. Reassignment (Phase 3) and meaningful monitoring
   depend on you providing the team leads and agents, or on the Host integration.
2. **The escalation matrix moves ownership by role text.** Without the Phase 2 fix, any reassignment of breached cases is undone
   within minutes.
3. **Recategorising 64 open cases is a business decision.** Titles show the old categories were unreliable.
4. **CASCADE from cases to teams** is a latent data-loss risk; fix it before any deletion.
5. **The shared database holds test cases**; migrating them as if real inflates the numbers.
6. **Calendar vs business hours** (workbook vs application) still applies to the SLA numbers.
7. The running :5110 backend must be restarted after each data step.

## 7. Decisions needed

| # | Decision |
|---|---|
| D1 | Who leads and staffs the 6 new teams (Cards, Deposits & Savings, Payments & Transfers, Digital Banking, Branch & ATM Services, KYC & Compliance)? Name existing users, or give name, email and role for new local users. |
| D2 | Benjamin Tan, Noraini Kassim, Tariq Aziz (Sales Pursuit only): deactivate (recommended), add them to a team, or delete (only possible if no audit event names them)? |
| D3 | Seed cleanup: retire all old-structure development seed steps (teams, users, routing, sub-categories)? Keep the sample customers? Set the base `Seed` to `Bootstrap`? |
| D4 | Delete (not deactivate) the 3 obsolete teams, 2 routing rules and, after Phase 3, the 15 retired sub-categories — confirmed? |
| D5 | Test cases on the shared database: resolve or close them instead of migrating? |
| D6 | When a case gets its workbook sub-category, does its priority change to that sub-category's default? |
| D7 | Escalation: should levels 3 and 4 (CX Supervisor, Head of CX) still **take ownership**, or only notify while the case stays with its team? |
| D8 | SLA migration: recompute open cases from their original start (recommended), and clear the breach flag when no longer breached under the new targets? |
| D9 | Monitoring: add a "status last changed" timestamp to show stale self-reported statuses? |
| D10 | Monitoring: add per-team workload, Total Teams and Escalated counts? |
| D11 | Assign UI: Option A (recommended) — or do you also want a dedicated bulk assignment page? |
| D12 | Transfer: does the priority follow the destination sub-category, or stay? |
| D13 | Transfer with no matching rule: allow any active team (today's behaviour) or deny? |
| D14 | New permission `cases.transfer`, or keep today's rule (holder, lead or `cases.assign`)? |
| D15 | Transfer approval workflow: out of scope for now? |
