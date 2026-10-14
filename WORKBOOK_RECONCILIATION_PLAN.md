# Workbook reconciliation plan — departments, teams, sub-categories, SLA

Status: **approved 2026-10-14 (D1–D8 as recommended; names, descriptions and priorities exactly as in the workbook) and APPLIED to
the shared database on 2026-10-14 at 04:31 UTC, with actor amina@bank.com, in one transaction.**

Verified on the shared database afterwards:
- the active configuration matches the workbook row by row: 11 teams, 64 sub-categories with ID, name, description, team and
  default priority, and 4 priorities with the workbook's response and resolution targets;
- a second run finds nothing to change;
- 101 audit events were written;
- no case was modified (78 cases).

Inputs: `reconciliation/workbook/` (the two worksheet exports plus `decisions.json`). Command:
`--reconcile-workbook reconciliation/workbook --decisions reconciliation/workbook/decisions.json [--apply --actor <email>]`.

Schema added: migration `SubCategoryDescriptionAndUniqueCode`, which adds `DepartmentSubCategories.Description` and makes `Code`
unique when it is set.

Sub-category descriptions are shown on Create Case and can be edited in Configurable Settings → Create Case Form → Sub-category.
Inspected 2026-10-13. Sources: `RMA_OmniCX_Case_Categories_Banking` (worksheets *Case Categories* and *SLA Matrix* only) and
read-only queries on the shared database. Background analysis: `WORKBOOK_RECONCILIATION.md`.

## 1. What was inspected

**Workbook.** *Case Categories* has 64 rows in 11 categories: LN 9, CD 10, AC 7, DS 5, PT 6, FD 6, DB 5, IN 3, BA 3, CF 6 and KC 4.
- No duplicate sub-category IDs, and every ID carries its category prefix.
- No duplicate names within a category.
- Default priorities: Critical 5, High 14, Medium 30, Low 15.
- The rows match the tables in the request.

*SLA Matrix* has 4 priorities, stated in calendar hours.

**Database (before).**

| | Count |
|---|---|
| Departments (= teams, one table) | 8 — 6 active, 2 inactive (Campaign Studio, Marketing Team) |
| Sub-categories | 15, all active; 10 mapped to a priority, 5 unmapped |
| Priorities | 4 (Critical, High, Medium, Low), all active, SLA version 16 |
| Cases | 78 — 64 open, 14 resolved |
| Routing rules | 6, all active, one per active team except none for the inactive ones |

Model facts that shape the plan:
- **Department and Team are the same record** (`Departments`). "Department + its team" is one row, with members in `TeamMembers`.
- Sub-categories already have a **`Code`** column. It is the natural place for the workbook ID (`LN-01`) next to the internal UUID.
  It is not unique today.
- Cases store the department as a foreign key, but the **sub-category and priority as text**. Retiring a sub-category therefore
  never breaks a case.
- Routing rules refer to departments **by name or code in their conditions text**. A rename must update them in the same transaction.
- A case keeps the SLA targets and due dates it was created with. Changing targets affects new cases only and resets no clocks.
- The sub-category's mapped priority is authoritative at case creation: the server uses it even if another priority is sent.
  Unmapped sub-categories require a choice.

## 2. Departments / teams — record by record

Existing teams that are demonstrably the same business entity are **renamed in place**. They keep their id, members, lead, cases,
routing rules and assignment history. Categories with no existing counterpart become **new teams**.

| Workbook category | Proposed source | Evidence | Members (lead) | Cases all / open | Action |
|---|---|---|---|---|---|
| **LN Loans** | Micro Finance (MF) | owns Loan Inquiry and Financing Disbursement | 10 (Aisha Sazlina) | 49 / 38 | rename → "Loans", code LN |
| **FD Fraud & Disputes** | Fraud Investigation (FI) | owns Fraud and Security Incident | 5 (Kavitha Raj) | 16 / 16 | rename → "Fraud & Disputes", code FD |
| **IN Investments & Insurance** | Premier Banking Squad (PBS) | owns Wealth Management | 5 (Amirul Hakim) | 0 / 0 | rename → "Investments & Insurance", code IN — **decision D1** |
| **AC Accounts** | Service Desk — Retail (SDR) | owns Account Maintenance | 5 (Nurul Aisyah) | 4 / 4 | rename → "Accounts", code AC — **decision D1** |
| **CF Complaints & Feedback** | Contact Center (CC) | general intake desk; most of its cases are Complaints | 5 (David Tan Sri) | 9 / 6 | rename → "Complaints & Feedback", code CF — **decision D1** |
| CD Cards | — | | none | — | create (no lead, no members) — **decision D2** |
| DS Deposits & Savings | — | | none | — | create — D2 |
| PT Payments & Transfers | — | | none | — | create — D2 |
| DB Digital Banking | — | | none | — | create — D2 |
| BA Branch & ATM Services | — | | none | — | create — D2 |
| KC KYC & Compliance | — | | none | — | create — D2 |

Not in the workbook:

| Team | Members | Cases | Action |
|---|---|---|---|
| Sales Pursuit (SP) | 6 (Grace Wong) | 0 | **deactivate** (archive; record and memberships kept). Its routing rule is deactivated too. Tariq Aziz, Noraini Kassim and Benjamin Tan belong to no other active team, so they receive no cases until they are added to one. |
| Campaign Studio (CS) | 1 | 0 | already inactive — unchanged |
| Marketing Team (MT) | 1 | 0 | already inactive — unchanged |

After: 14 department rows — **11 active (the workbook categories)**, 3 inactive and kept for history.

The "Function" text of renamed teams is left unchanged; for example, PBS reads "High net worth & priority customer desk". It can be
edited on the Teams page.

## 3. Routing rules

| Rule | Today | Proposed |
|---|---|---|
| Fraud & Security Operations | Department = Fraud Investigation (or Category = Fraud) → FI | condition text → "Fraud & Disputes"; the retired "Fraud" category condition becomes inert (rule uses ANY) |
| Micro Finance Operations | Department = Micro Finance → MF | condition text → "Loans" |
| Retail Service Desk Operations | Department = Service Desk — Retail → SDR | condition text → "Accounts" |
| General Contact Center Intake | Department = Contact Center → CC | condition text → "Complaints & Feedback" |
| Premier Segment Fast-Lane | Segment = Premier and Priority = Critical → PBS | **decision D3**: would send every critical Premier case to Investments & Insurance |
| Sales Pursuit Desk | Department = Sales Pursuit → SP | deactivate |

Rule names and descriptions are labels. They are left as they are unless you want them renamed. The 6 new teams need no rule: with
no matching rule, a case stays in the team it was opened for.

## 4. Sub-categories — record by record

**Create 64**, one per workbook row:
- name exactly as in the workbook;
- `Code` = workbook ID;
- display order = workbook order;
- active;
- under the department in section 2;
- **mapped to its default priority** (one mapping each; the database already enforces at most one).

| Dept | ID → priority |
|---|---|
| LN | LN-01 Loan application status → Medium · LN-02 Personal loan inquiry → Low · LN-03 Home loan / mortgage inquiry → Medium · LN-04 Auto loan inquiry → Medium · LN-05 Repayment / instalment issue → High · LN-06 Early settlement → Medium · LN-07 Restructuring / rescheduling → High · LN-08 Interest rate query → Medium · LN-09 Statement / payoff letter → Low |
| CD | CD-01 New card application → Medium · CD-02 Card activation → Medium · CD-03 Lost / stolen card → **Critical** · CD-04 Card replacement / renewal → Medium · CD-05 PIN reset → Medium · CD-06 Credit limit change → Medium · CD-07 Billing statement query → Medium · CD-08 Annual fee waiver → Low · CD-09 Rewards / points → Low · CD-10 Instalment plan → Low |
| AC | AC-01 Account opening → Medium · AC-02 Account closure → Medium · AC-03 Change of personal details → Medium · AC-04 Dormant account → Medium · AC-05 Statement request → Low · AC-06 Joint account → Medium · AC-07 Fees / minimum balance query → Low |
| DS | DS-01 Fixed deposit placement → Medium · DS-02 Fixed deposit withdrawal → Medium · DS-03 Interest query → Low · DS-04 Maturity instruction → Low · DS-05 Savings plan → Low |
| PT | PT-01 Failed transaction → High · PT-02 Delayed transfer → High · PT-03 Wrong beneficiary → High · PT-04 Instant / interbank transfer issue → High · PT-05 Standing instruction → Medium · PT-06 Bill payment → Medium |
| FD | FD-01 Unauthorised transaction → **Critical** · FD-02 Card fraud → **Critical** · FD-03 Phishing / scam report → **Critical** · FD-04 Chargeback / merchant dispute → High · FD-05 ATM cash not dispensed → High · FD-06 Duplicate charge → High |
| DB | DB-01 Login / access issue → High · DB-02 OTP / secure device issue → High · DB-03 App error / bug → Medium · DB-04 Password reset → Medium · DB-05 Device / token change → Medium |
| IN | IN-01 Unit trust / wealth inquiry → Low · IN-02 Insurance policy query → Low · IN-03 Insurance claim → Medium |
| BA | BA-01 Branch service complaint → Medium · BA-02 ATM / CDM fault → Medium · BA-03 Cheque book request → Low |
| CF | CF-01 Staff conduct → High · CF-02 Service delay → Medium · CF-03 Fee dispute → Medium · CF-04 Regulatory complaint → **Critical** · CF-05 Compliment → Low · CF-06 Suggestion → Low |
| KC | KC-01 Document update → Medium · KC-02 KYC verification → Medium · KC-03 AML / source-of-funds query → High · KC-04 Account freeze / unfreeze → High |

**Deactivate all 15 existing sub-categories.** None is in the workbook. Rows and their priority mappings are kept for history. They
disappear from Create Case, and cases keep their text value.

| Team (today) | Sub-category (code) | Priority | Cases referencing it (open) |
|---|---|---|---|
| CC | Account Access (ACC) | High | 0 |
| CC | Card Dispute (DIS) | Medium | 3 (3) |
| CC | General Inquiry (GEN) | Low | 4 (1) |
| CC | Payment Issue (PAY) | — | 0 |
| FI | Fraud (FRD) | Critical | 8 (8) |
| FI | Security Incident (SEC) | Critical | 2 (2) |
| MF | Loan Inquiry (LON) | Low | 0 |
| MF | Financing Disbursement (FND) | High | 0 |
| MF | General Inquiry (General_Inquiry) | — | 49 (38) — added earlier today at your request; retired by this plan |
| PBS | Wealth Management (WLM) | — | 0 |
| PBS | Premier Account Services (PAS) | — | 0 |
| SDR | Account Maintenance (ACM) | Medium | 1 (1) |
| SDR | Card Replacement (CRP) | Critical | 0 |
| SP | Product Application (APP) | — | 0 |
| SP | Lead Follow-up (LDF) | Low | 0 |

Already outside the configured list (from the earlier reconciliation report), left as they are:
- FI: Card Dispute 2, General Inquiry 1, General Request 1, Loan Inquiry 1, Payment Issue 1;
- SDR: General Request 1;
- blank on 4 cases.

After: 79 sub-category rows — **64 active (all workbook rows, all mapped)**, 15 inactive.

**Existing cases are not recategorised.** Their department, sub-category text, priority and SLA snapshot stay as they are. This
reconciliation changes configuration, not history. Moving the 64 open cases onto workbook sub-categories would be a separate,
case-by-case decision (D6).

## 5. SLA matrix

Update the 4 existing priority rules in place (no new records), through the SLA service. This audits the change and bumps the
version (16 → 17). Open cases keep their snapshot targets; no clock is reset.

| Priority | First response (today → proposed) | External resolution (today → proposed) | Internal resolution (today) |
|---|---|---|---|
| Critical | 30 min → **1 h** | 4 h → **4 h** | 2 h — **D4** |
| High | 1 h → **2 h** | 8 h → **24 h** | 6 h — D4 |
| Medium | 4 h → **4 h** | 12 h → **48 h** | 10 h — D4 |
| Low | 8 h → **8 h** | 24 h → **120 h** | 22 h — D4 |

Mapping: workbook *Response* → first response; workbook *Resolution* → **external** (customer-facing) resolution. The application has
a second, internal target that the workbook does not define (D4).

**Units (D5).** The workbook says calendar hours. The application counts **business hours**: Mon–Fri 09:00–17:00, which is 8 h a day,
holidays excluded. Entered as-is:
- Low resolution of 120 h = 15 working days, not 5 calendar days;
- High resolution of 24 h = 3 working days, not 1 calendar day.

## 6. How it would be applied

A one-off command, in the same style as the earlier `--reconcile-data`:

```bash
dotnet CaseManagement.Api.dll --reconcile-workbook <folder with the two worksheet CSVs> [--apply --actor <email>] [--report file.json]
```

- **Input:** the two exported worksheets plus the approved choices in this plan. No business data lives in code, and there is no
  seed step.
- **Dry run by default.** It simulates everything in a transaction that is rolled back.
- **Apply** runs in **one transaction**. It renames and updates the routing-rule text, creates the teams and sub-categories with
  their mappings, deactivates the retired records and updates the SLA rules through the SLA service. Every change is audited in the
  configuration history.
- **Re-runnable.** It matches on department code and sub-category code (the workbook IDs), so a second run finds nothing to do.
- **Optional (D7):** a unique index on the sub-category code, plus a friendly duplicate check in the settings editor, so the
  business ID stays unique.
- **Verification:**
  - automated tests on PostgreSQL;
  - a rehearsal on a full copy of the shared database;
  - the dry run on the shared database, then the apply;
  - read-back queries against the workbook;
  - a Create Case check (FD → FD-01 resolves to Critical with the Critical SLA);
  - the full regression suite.
- **Rollback:**
  - restore names and codes, and reactivate the old sub-categories and teams;
  - deactivate the new ones;
  - restore the SLA values. Every old value is in the report and the audit history.

## 7. Decisions needed

| # | Decision | Recommendation |
|---|---|---|
| D1 | Which existing teams become which categories (section 2): PBS → Investments & Insurance, SDR → Accounts, CC → Complaints & Feedback? Alternatives: CC → Digital Banking or Payments & Transfers; SDR → Cards. | as proposed |
| D2 | The 6 new teams have no lead or members. Until you staff them on the Teams page, their cases stay with whoever created them (no automatic assignment). Name leads and members now, or staff them afterwards? | create empty; staff on the Teams page |
| D3 | Premier Segment Fast-Lane rule: deactivate it, or keep it pointing at Investments & Insurance? | deactivate |
| D4 | Internal resolution target, which the workbook does not define: keep today's values (2 / 6 / 10 / 22 h, all below the new external targets), or set it equal to the external target? | keep today's values |
| D5 | Hours: enter the workbook numbers as business hours, or have the business restate them? | enter as-is, and note it |
| D6 | Existing cases: leave their old sub-category values (history), or recategorise open cases one by one afterwards? | leave |
| D7 | Make the sub-category code (workbook ID) unique with a schema index? | yes |
| D8 | Sales Pursuit: deactivate (3 people then have no active team), or map it to a category? | deactivate |
