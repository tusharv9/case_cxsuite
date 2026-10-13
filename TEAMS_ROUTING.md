# Teams, routing, assignment, skills & monitoring

## The model

* A **team** is a `Department`. Its people are its **active `TeamMembers`** — the *only* membership list. Routing, the Teams page and the Team Monitor all use it. (A user's "home department" no longer makes them eligible; removing someone from a team really removes them.)
* A member can be **on the team but not receive cases** (`IsAssignable = false`) — e.g. the lead.
* There is no "queue" entity and no per-team channel list: a team *is* the queue, and channel handling is expressed with routing rules and skills. (The unused `Departments.Channels`, `TeamMembers.PrimaryChannel` and `RoutingRules.TargetQueueName` columns were dropped.)
* Nothing in the engine refers to a particular team, code or name.

## Routing (`RoutingEngineService`)

1. **Rules** — active rules are tried in order; the first match decides the team. Every condition is an **exact** (case-insensitive) comparison with a configured value, never "contains". A rule with no conditions is a deliberate catch-all. An unreadable rule never matches.
2. **No rule / inactive destination** — the case stays with the team it was opened for. If that team is inactive or missing the case is **refused with a clear error**; there is no hidden default team.
3. **Authoring** — `GET /api/routing-rules/vocabulary` lists what a rule may look at and the valid values (teams, sub-categories, case types, priorities, channels, customer segments, algorithms). The editor offers only those, and the server rejects anything else and rules that target an inactive team.

## Assignment

Eligible agents = active member + assignable + active Host account + **Available/Busy** + **below capacity**. This pool is built *before* the algorithm runs, so **every** algorithm respects capacity:

| Algorithm | Picks |
|---|---|
| `RoundRobin` | the next eligible agent after the previous assignment (pointer kept per team) |
| `LeastOccupancy` | fewest open cases, Available before Busy |
| `SkillBased` | highest skill score for the skills the case needs (see below); if nobody holds them, lowest load — and the routing log says so |

* **Settings** — a global default (`AssignmentConfigurations` row with no team; created by the migration/bootstrap seed, edited on *Cases SLA & Routing*) and an optional **per-team override** (edited on the Teams page). Algorithm and capacity are validated; an unknown algorithm is an error, not a silent "RoundRobin".
* **Nobody can take it** (no members / none available / all at capacity) — the case is **held by the team lead**, the routing log and a `CASE_UNASSIGNED` notification say *why*. If the team has no lead it stays with its creator. It is never silently given to an overloaded agent.
* **Concurrency** — routing runs **inside the same transaction that stores the case**, and assignments to one team are serialised with a PostgreSQL advisory transaction lock. Simultaneous cases cannot be handed to the same "least loaded" agent or the same round-robin position, and the round-robin pointer commits with the case.

## Manual assign, reassign and transfer (one set of rules)

`AssignmentEligibilityService` (`Services/Assignment/AssignmentEligibility.cs`) judges every person for a team; automatic routing
(`AgentPoolService`) and the manual paths use it, so the rules cannot drift apart. The policies:

| | Automatic (routing) | Manual (a person chooses) |
|---|---|---|
| Who | active members marked assignable | active members selected for manual assignment (`CanBeManuallyAssigned`), and team leads unless excluded; `IsAssignable` only opts out of *automatic* routing |
| Status | Available / Busy | Available / Busy, unless the setting is off |
| Capacity | below the team's capacity | below the case team's capacity, unless the setting is off |
| Other teams | — | per the cross-team setting (off / selected teams / all active teams); choosing someone outside the case's team also needs `cases.assign`, and the case stays with its team |

The manual column is the administrator's **Assign & Reassign** settings (Configurable Settings → Case Management), read on every
assignment through `AssignmentEligibilityService.GetManualPolicyAsync` (cached, cleared when the settings are saved).

* `GET /api/cases/{id}/eligible-assignees` — the case's team members and lead, each with live status, open cases, capacity and,
  when they cannot take it, a reason code (`NotTeamMember`, `UserInactive`, `NotSelected`, `LeadExcluded`, `Unavailable`, `AtCapacity`, `NeedsAssignPermission`, `TeamInactive`, `CurrentOwner`) and message.
* `PUT /api/cases/{id}/assign` — **422** `{ error, code }` when the person is not eligible; **403** when the caller may not change the holder
  (see `cases.assign` in HOST_INTEGRATION.md). The check runs under the same per-team lock as routing, so capacity cannot be raced.
* `PUT /api/cases/{id}/transfer` — refused (422 `TeamInactive`) for an inactive team. The receiving team's active lead takes the case;
  without one, the team's algorithm picks an eligible agent; if nobody can, the transfer is refused (422 `NoEligibleAssignee`) instead of leaving the case with someone outside its team.
* Existing data that breaks these rules is listed, never changed, by `backend/Data/Reports/assignment-integrity-report.sql` (read-only).

## Skills

* **Skill rules** (`SkillRules`): "when *field* contains/equals *value*, the case needs *skill*". Fields: title, description, case type, channel, sub-category, priority, customer segment. Replaces the `fraud/loan/card/atm` keywords that were hard-coded.
* **Agent skills** (`AgentSkills`): skill name + level 1–5 per agent.
* Managed from *Cases SLA & Routing → Routing Rules → Manage skills* (`/api/skills/*`, `teams.manage`).

## Team Monitor (`GET /api/team-monitoring/overview?teamId=`)

One request returns everything, for all teams or one. All figures are computed from live data; **where there is no data the answer is "none" (null), never a placeholder**:

* agents = active team members; state from their status; open / breached cases (breach = the **SLA clock's** verdict); resolved today; capacity
* longest wait = oldest open case still waiting for a first answer (waiting since its SLA clock started), and whether its first-response target was missed
* average time to resolve today vs yesterday (in the business time zone)
* occupancy = open cases held by available agents ÷ their capacity (target band configurable: `TeamMonitoring:OccupancyTargetMin/Max`)
* queue health per configured **source channel** (plus any channel cases actually use)
* SLA at-risk = Approaching/Breached by the SLA clock

The page refreshes every 15 s **only while the tab is visible**, never overlaps requests, and shows a "data may be out of date" notice if refreshes fail. CSAT and "handled" figures that were derived from a hash of the agent's name are gone; CSAT needs a survey data source that does not exist yet.

## Migration `TeamsRoutingMonitoring`

* adds `TeamMembers.IsAssignable`, `SkillRules`, a unique per-team assignment-settings row; drops the three unused columns
* **data**: every active user who was eligible through their home team gets a real membership row (nobody silently leaves rotation); team leads become members (not assignable unless they were eligible before); the global assignment settings row is created if missing
