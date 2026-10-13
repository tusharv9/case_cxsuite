# Workbook reconciliation — `RMA_OmniCX_Case_Categories_Banking`

Status: **analysis for business sign-off. Nothing from the workbook has been imported**, and nothing will be until the decisions at
the end are made. The workbook calls itself *"Version 0.1 DRAFT — For Tech Team review"* and says its categories, priorities, queue
names and SLA hours are *proposed defaults, not taken from an existing bank system*.

Compared on 2026-10-13 against the configured database (read-only queries; it contains development sample data, so the
"application" column describes sample configuration, not production).

## 1. What the workbook contains

| Sheet | Content |
|---|---|
| Read Me | Purpose, assumptions, open points. Describes a **Summary** sheet, a **routing queue** column, **Response/Resolution SLA** columns and **Escalation Required / Regulatory–Sensitive** flags. |
| Case Categories | 64 rows: Category ID, Category, Sub-category ID, Sub-category, Description, Default Priority, Remarks. **None of the columns the Read Me describes beyond these exist** (no queue, no SLA columns, no flags). |
| SLA Matrix | 4 priorities with response and resolution hours, stated as **calendar hours**. |

11 categories: Loans (9), Cards (10), Accounts (7), Deposits & Savings (5), Payments & Transfers (6), Fraud & Disputes (6),
Digital Banking (5), Investments & Insurance (3), Branch & ATM Services (3), Complaints & Feedback (6), KYC & Compliance (4).
Default priorities: Critical 5, High 14, Medium 30, Low 15. (An earlier audit note said 12 categories / 62 rows; the correct count is 11 / 64.)

## 2. The model difference that needs a decision first

| | Workbook | Application |
|---|---|---|
| Level 1 | **Category** — a product area (Loans, Cards, …) | **Department = Team** — an organisational unit that owns and works the case (Micro Finance, Contact Center, …) |
| Level 2 | Sub-category | Sub-category, **belonging to one department** |
| Default priority | per sub-category | per sub-category (`PriorityCategoryMappings`) |
| Routing | "queue" (not present in the sheet) | routing rules + team assignment |

Importing the 11 categories as departments would create 11 teams and contradict the department/team alignment (CM-13: one team per
department, 6 active today). The categories are a product classification, not teams.

**Recommendation (option A, no schema change):** keep Department as the organisational level; for each workbook sub-category, decide
which department owns it and add it there as a sub-category with its default priority. The category name can become a prefix or a
naming convention if wanted. **Option B** — a real Category level between Department and Sub-category — is a schema and UI change
(Create Case, routing vocabulary, filters, SLA mapping) and should only be chosen if reporting by product category is required.

## 3. Priorities and SLA targets

Same four names in both; the targets differ, and so do the units.

| Priority | Workbook response | Application first response | Workbook resolution | Application internal / external resolution |
|---|---|---|---|---|
| Critical | 1 h | 30 min | 4 h | 2 h / 4 h |
| High | 2 h | 1 h | 24 h | 6 h / 8 h |
| Medium | 4 h | 4 h | 48 h | 10 h / 12 h |
| Low | 8 h | 8 h | 120 h | 22 h / 24 h |

* **Units:** the application measures **business time** (working hours of the configured calendar, holidays excluded, pauses
  added); the workbook states **calendar hours**. "48 calendar hours" and "48 business hours" are different promises. Converting
  needs the business day length (e.g. 9 working hours/day → 48 calendar h ≈ 2 working days ≈ 18 business hours).
* **Internal vs external:** the application has two resolution targets (internal, stricter; external, customer-facing). The
  workbook has one; it would map to the **external** target, and an internal target must still be chosen.
* **Effect on cases:** a case keeps the targets of the version it was created with (`SlaConfigVersion` snapshot). Changing targets
  affects new cases only; running SLA clocks are never reset or recalculated.

## 4. Sub-categories: workbook vs application

The application has 14 sub-categories in 6 departments; the workbook has 64. Closest name matches (automatic, for orientation only):

| Application (department / sub-category) | Priority | Closest workbook row | Workbook priority | Note |
|---|---|---|---|---|
| Service Desk — Retail / Card Replacement | Critical | Cards / Card replacement / renewal | Medium | **Conflict** — the workbook treats Lost / stolen card (CD-03) as Critical, replacement as Medium |
| Fraud Investigation / Fraud | Critical | Fraud & Disputes / Card fraud (or Unauthorised transaction) | Critical | consistent |
| Micro Finance / Loan Inquiry | Low | Loans / Personal loan inquiry | Low | consistent (the workbook splits inquiries by loan type) |
| Contact Center / Card Dispute | Medium | Fraud & Disputes / Chargeback / merchant dispute | High | **Conflict** |
| Contact Center / Payment Issue | — (none) | Payments & Transfers / Failed transaction, Delayed transfer, … | High | the application has no priority mapped |
| Contact Center / Account Access | High | Digital Banking / Login / access issue | High | consistent |
| Others (General Inquiry, Security Incident, Financing Disbursement, Premier Account Services, Wealth Management, Lead Follow-up, Product Application, Account Maintenance) | | no clear equivalent | | application-specific |

Four application sub-categories have **no priority mapped** (Payment Issue, Premier Account Services, Wealth Management, Product
Application): Create Case asks the agent to choose one, and the SLA matrix shows them as "Requires Mapping".

## 5. Suggested ownership for discussion (to be confirmed — not applied)

| Workbook category | Candidate department | Why / open question |
|---|---|---|
| Loans | Micro Finance | already owns loan sub-categories |
| Cards | Service Desk — Retail or Contact Center | card replacement sits in Service Desk today, card disputes in Contact Center |
| Accounts | Service Desk — Retail | account maintenance sits there today |
| Deposits & Savings | Service Desk — Retail | no current owner |
| Payments & Transfers | Contact Center | payment issues sit there today |
| Fraud & Disputes | Fraud Investigation (fraud) / Contact Center (merchant disputes) | split by nature? |
| Digital Banking | Contact Center | account access sits there today |
| Investments & Insurance | Premier Banking Squad | wealth management sits there today |
| Branch & ATM Services | Service Desk — Retail | no current owner |
| Complaints & Feedback | Contact Center | or the department the complaint is about? |
| KYC & Compliance | **no team exists** | a Compliance team would be a new department/team (CM-13) |

## 6. Decisions needed

1. Option A (sub-categories under existing departments) or option B (new Category level)?
2. Which department owns each workbook category (or each sub-category, where a category splits)?
3. SLA targets: approve the workbook's numbers, convert calendar → business hours (how many working hours per day?), and set the
   internal target for each priority.
4. The two priority conflicts above (Card Replacement, Card Dispute): which is right?
5. KYC & Compliance: create a Compliance team, or assign to an existing one?
6. The workbook's missing columns (queue, Escalation Required, Regulatory/Sensitive): are they still wanted? "Regulatory/Sensitive"
   would map to masking/access rules; "Escalation Required" has no equivalent today.

## 7. How it will be applied once approved (no import script, no seeding)

Everything above is ordinary configuration, entered where it is enforced — reviewed and audited like any other change:

* priorities and targets: Cases SLA & Routing → Priority SLA Matrix (a priority cannot be saved without its three targets);
* sub-categories and their default priority: Configurable Settings → Create Case Form → Sub-category, then the SLA matrix mapping;
* a new team (e.g. Compliance): Teams page.

If the approved list is long, a one-off, reviewed data migration can be written from the signed-off mapping instead of manual entry.
