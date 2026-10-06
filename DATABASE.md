# Database: schema, migrations and seed data

## How the database is prepared
The API no longer creates or alters tables while it boots. `DatabaseInitializer` (backend/Data) does it
in the background, so the process answers `/health` immediately:

| Endpoint | Meaning |
|---|---|
| `GET /health` | Process is alive (always fast). |
| `GET /ready` | `200` once the database is migrated and seeded; `503` with `status`/`message` otherwise (`Initializing`, `MigrationRequired`, `Failed`). |
| any `/api/*` | `503` + `Retry-After: 5` until ready (instead of confusing errors from half-built tables). |

Steps: wait for the database (retries while a scale-to-zero database wakes) → adopt a legacy database
**or** apply EF migrations → run due seed steps → ready. The SLA worker waits for readiness.

## Configuration (`Database` section / `Database__*` env vars)
| Key | Default | Meaning |
|---|---|---|
| `MigrateOnStartup` | `true` in Development, `false` elsewhere | Apply migrations at start. When `false` and the schema is out of date the API stays *not ready* and says why. |
| `Seed` | `Development` in Development, `Bootstrap` elsewhere | `None` / `Bootstrap` (required configuration only) / `Development` (adds sample users, teams, customers, routing rules, skills). |
| `ConnectTimeoutSeconds` | `120` | How long to keep retrying an unreachable database. |

Explicit deployment step (exit code `0` on success, `1` on failure):
```
dotnet CaseManagement.Api.dll --migrate-only
```

## Changing the schema
Never edit DDL in `Program.cs` or `LegacySchemaUpgrade` (frozen). Use EF migrations:
```
cd backend
dotnet ef migrations add <Name>        # needs no database; uses DesignTimeDbContextFactory
dotnet ef database update              # optional, against ConnectionStrings__DefaultConnection
```
Things EF cannot model (sequences, extensions, expression/trigram indexes) live in `Data/SchemaExtras.cs`
and are applied by the Baseline migration; add new ones in a new migration with `migrationBuilder.Sql(...)`.

## Existing databases (created by the old startup code)
They have tables but no `__EFMigrationsHistory`. On first start with migration enabled the app **adopts**
them atomically (one transaction): additive upgrade script, convergence to the model (missing FK
indexes/FK; NULLs in columns the model requires are filled with the column default, then NOT NULL),
case-number sequence moved past the highest existing number, Baseline recorded. **No data is dropped
or re-seeded**, and the destructive statements the old bootstrap ran on every start (DROP TABLE/COLUMN,
nulling customer segments) are gone.

## Seed data
Seeding is a list of **one-time, versioned steps** (`DbSeeder.Steps`) recorded in `SeedHistory`.
A step never runs twice, so data an administrator deleted is not re-created on restart. To ship new
defaults add a new step key (e.g. `bootstrap.x.v2`). Dev/sample steps only run in `Development` mode.

## Real-PostgreSQL integration tests
```
TEST_POSTGRES_ADMIN_CONNECTION="Host=127.0.0.1;Port=5432;Username=postgres" dotnet test tests/CaseManagement.Tests
```
They create and drop their own `cmtest_*` databases (never use a real environment's server). Without the
variable they are skipped.

## SLA engine tables (Phase 5)

`BusinessCalendarSettings` (one row: the calendar's IANA time zone), `Notifications.EventKey` (unique per recipient when set), `Cases.SlaReminderSent`. See [SLA_ENGINE.md](SLA_ENGINE.md).

## Teams, routing & monitoring (Phase 6)

`TeamMembers` is the only team membership; `TeamMembers.IsAssignable`, `SkillRules`, one `AssignmentConfigurations` row per team (unique) plus the global row. Dropped: `Departments.Channels`, `TeamMembers.PrimaryChannel`, `RoutingRules.TargetQueueName`. See [TEAMS_ROUTING.md](TEAMS_ROUTING.md).

## Attachments (Phase 7)

`CaseAttachments.ContentHash` (SHA-256, nullable for earlier uploads). Files themselves are not in the database: see [NOTIFICATIONS_ATTACHMENTS.md](NOTIFICATIONS_ATTACHMENTS.md) for storage.

## Phase 8 additions

- `Cases.SlaOutcome` (text, nullable): persisted result of the SLA clock when a case stops (`Met` / `Breached`). Set by `SlaClock.Stop`; existing closed cases are back-filled once at startup by `SlaMonitorService.BackfillOutcomesAsync`. Lets dashboards count breaches in SQL instead of loading cases.
- Partial indexes over **open** cases only (`Status NOT IN ('Resolved','Closed','Cancelled')`): `(OwnerId, Status)` and `(DepartmentId, Status)`, plus an index on breached outcomes. Migrations: `SlaOutcomeAndPerformance`, `OpenCaseIndexes`. Back up the database before the first start on an existing deployment.
