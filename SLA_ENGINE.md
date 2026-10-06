# SLA, business time & escalation engine

One definition of "how is this case doing against its SLA", used by **everything** that needs it: the background monitor,
the dashboard, the case board/list/drawer, Customer 360, team monitoring and notifications. Before Phase 5 there were four
different formulas that could disagree about the same case.

## The rules (`backend/Services/Sla/SlaClock.cs`)

| Topic | Rule |
|---|---|
| Unit | Targets are **business minutes**: working hours of the configured calendar. Evenings, weekends and holidays do not count. |
| Start | The clock starts when the case is created. **Reassignment does not reset it** (the customer's wait started when the case opened). |
| Pause | *Waiting on Customer* pauses the clock. The paused time is measured in business minutes and added to every due date, so a pause postpones breach and escalation by exactly that much. |
| Stop | Resolving stops the clock. The case then reads **Met** or **Breached** permanently. |
| Targets | Snapshotted from the priority's rule at creation (`Case.*TargetMinutes`, `SlaConfigVersion`). Changing a rule later never rewrites history. Raising a case's priority (swarm) re-applies the new priority's targets, keeping the original start and paused time. |
| Health | Judged on the **external** (customer-facing) target: `Healthy → Approaching → Breached`, plus `Paused` and `Met`. Breaching the stricter **internal** target — or reaching the reminder threshold — reads as *Approaching*. |
| First response | The first customer-facing reply (public note, or the move to *In Progress*) is judged against the first-response target in business time; the verdict is final. |

`case.sla` on every case DTO carries the verdict (`health`, `isPaused`, `isStopped`, `isClockRunning`, and for `internal` /
`external` / `firstResponse`: target, consumed, remaining, percent, due date, breached). The browser only formats it and ticks
it down between refreshes (at most 10 minutes, only while the server said the clock is running). It contains no SLA rules.

## Calendar (`BusinessCalendar`, `BusinessTimeService`)

* Weekly hours (all seven days must be configured), holidays, and a **time zone** (`BusinessCalendarSettings`, edited on
  *Cases SLA & Routing → Operating Hours*; an IANA id such as `Asia/Kuala_Lumpur`). It used to be a constant in the code.
* A missing/unusable calendar (no zone, a missing day, no working time at all) is an error — never a silent "Mon–Fri 9–5".
* The calendar is cached and cleared automatically when any of its tables change (`ConfigChangeInterceptor`).
* One window per day; a window cannot span midnight.

## Escalation (`EscalationService`, `SlaMonitorService`)

Every level has a **structured trigger** the engine can execute — nothing else can be configured:

| Trigger | Value | Fires when |
|---|---|---|
| `SlaPercentage` | % | internal-target consumption ≥ value |
| `SlaBreached` | – | internal target breached |
| `SlaPostBreachHours` | hours | internal breach was recorded at least this long ago |
| `FirstResponseBreached` | – | the first-response target was missed |
| `ManualOnly` | – | never automatically (skipped, does not block later levels) |

* The trigger text shown in the UI is **derived** from these fields, so it cannot disagree with what runs.
* Levels fire **in order**, one per cycle. **Inactive** levels are skipped. **Paused** cases never escalate.
* **Level 1** is where every case starts, so its trigger is the early *reminder* to the case owner (default 70%). It is sent once (`Case.SlaReminderSent`).
* **Who receives it** (`AssignmentType`): `Role` (exact, case-insensitive match on the role your Host App gives users; the case's own team is preferred; inactive users and the current owner are never chosen), `User`, `DepartmentOwner`, or `Owner`. If nobody holds the role the department owner is the explicit last resort — there is **no "anyone" fallback**. If no target exists the escalation is still recorded and the owner is left unchanged.
* Deleting a level renumbers the rest and moves cases with it; replacing the matrix clamps cases to the highest level that exists.

## The monitor

`SlaEscalationBackgroundService` runs `ISlaMonitor.RunCycleAsync` on an interval:

```jsonc
"SlaMonitor": { "Enabled": true, "IntervalSeconds": 120 }
```

* A PostgreSQL **advisory lock** makes it single-instance across any number of running copies — no duplicate escalations when scaled out. Set `Enabled=false` on instances that should only serve web traffic.
* One failing case is logged and skipped; the rest of the cycle continues.
* Notifications are sent **by the monitor**, never as a side effect of reading the notification list, and each event is notified once (`Notifications.EventKey`, e.g. `escalation:{case}:{level}`), so two genuine escalations in a few minutes no longer swallow each other.
* Breach reminders keep their cooldown (60 min) and maximum (3) as before.

## Migration `SlaEngine`

* Drops `Sla90Escalated`, `SlaBreachedEscalated`, `Sla12hBreachedEscalated` (level-number flags); renames `Sla70ReminderSent` → `SlaReminderSent`.
* Adds `BusinessCalendarSettings` (seeded `Asia/Kuala_Lumpur`, i.e. today's behaviour) and `Notifications.EventKey`.
* Escalation data: level 1 → assignment `Owner`; levels created by the old editor without a threshold get an explicit `70`; trigger text regenerated from the structure; arbitrary users pinned by the old seeder on `Role` levels are cleared.
* Cases created by the linked/reopened-subcase workflows (which had no SLA snapshot) get their priority's targets.
* **Known approximation:** time already paused on cases that existed before this migration was counted in *calendar* minutes; from now on it is business minutes. Those few cases may be off by the difference once.
