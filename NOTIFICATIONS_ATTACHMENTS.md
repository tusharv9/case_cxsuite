# Notifications, dashboard, Customer 360 & attachments

## Attachments (`AttachmentService`, `AttachmentValidator`, `IAttachmentStore`)

A file is judged by its **content**, not by what the client says it is:

* name → no path, no control characters, ≤ 200 characters
* extension must be on the allowed list **and** one the content check can verify (pdf, png, jpg/jpeg, gif, bmp, zip, docx, xlsx, 7z, rar, doc, xls, msg, txt, csv, eml). Anything else is refused even if an administrator lists it.
* the first bytes must match the extension (`%PDF-`, PNG/JPEG/GIF signatures, ZIP/OLE containers…)
* programs and scripts are refused under any name (Windows/Linux/macOS executables, `#!` scripts); "text" files containing web-page or script content (`<html`, `<svg`, `<script`…) are refused
* SVG/HTML/JS/PHP are never accepted (stored XSS). SVG was removed from the default allowed list.
* the **content type is decided by the server** from the verified extension; the client's `Content-Type` is ignored
* a SHA-256 of the stored bytes is recorded (`CaseAttachments.ContentHash`) and returned as `X-Content-SHA256` on download

Downloads are **always downloads**: `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`, `Cache-Control: private, no-store`, `Content-Security-Policy: default-src 'none'; sandbox`. The file is streamed (not loaded into memory). An attachment id under another case's URL is "not found". Reading needs `cases.read`, uploading `cases.write`.

**Storage** is behind `IAttachmentStore` (local disk today; object storage = one more implementation). Set **`Attachments:StoragePath`** to a *persistent volume* in production — on a host with an ephemeral file system (e.g. a free Render instance) files under the application folder are lost on every deploy; the app logs a warning at start-up when it is left unset in Production. If saving the database row fails the stored file is removed (no orphans).

## Notifications (`NotificationService`)

* Behaviour is configuration (`Notifications` section): `BreachReminderCooldownMinutes` (60), `BreachMaxReminders` (3), `BreachGroupingThreshold` (3, 0 = off), `BreachPriority`, `ReadRetentionDays` (30), `MaxAgeDays` (180), `DuplicateWindowMinutes` (5).
* **Configuration-change notices** go only to active users whose Host role carries `config.manage` (exact role match through the permission map; in Standalone mode, everyone). They used to go to anyone whose role *contained* "Admin", "Officer" or "Agent".
* **Retention**: read notifications are deleted after `ReadRetentionDays`, anything after `MaxAgeDays`. It runs at the end of each SLA-monitor cycle (single-instance, advisory-locked).
* Events with a key are notified once ever (`EventKey`); the SLA monitor — not a page load — creates SLA notifications (Phase 5).

## Dashboard (`DashboardService`)

* Moved out of `CaseService`. `GET /api/dashboard/filters` returns every filter option in one request (the page used to make seven), `GET /api/dashboard/summary` the figures.
* "Today / this week / last week / this month / last month / this quarter / this year / custom" are measured in the **business time zone** (weeks start Monday; a custom end date is inclusive). An unknown range or status is an error (400), never silently "all time". The filter bar only offers ranges the server can compute.
* SLA health is the SLA clock's verdict; the "needs attention" list is the worst open cases first (breached → approaching by % used → priority) and each row carries its `sla`. Recent activity follows the same filters and only lists events that belong to a case. "Resolved over time" is bucketed in the business time zone.
* Front end: no built-in fallback lists, an error banner (with retry) if the filters fail, and no 10-second whole-page re-render. Fixed along the way: the department filter sent a name where the API expects an id.

## Customer 360

The Products / Banking timeline / Transactions / Referral tabs had no backend (their tables were dropped) and always showed "(0)". They are removed. **Timeline** is now real: `GET /api/customers/{id}/timeline` lists case milestones (opened, assigned, transferred, escalated, resolved) and customer-visible messages across the customer's cases, newest first, paged. Internal notes and automatic bookkeeping are not part of it. The Overview tab shows the case count and recent activity.

## Migration `AttachmentIntegrity`

Adds `CaseAttachments.ContentHash` (nullable; earlier files have none).
