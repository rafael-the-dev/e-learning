# Student Examination Portal v1.0.1 — 2026-07-18

**Status: Production Ready · Frozen · Maintenance.** The first student-facing exam
experience, a dedicated `/student/examinations` module over the **frozen** Examination
Engine — no schema, migration, or engine change. Frozen after a UX Audit (Overall
7.5/10, 0 Critical / 0 High) and a Security Review. v1.0.1 folds in the three UX-audit
fixes on top of the v1.0.0 feature build:

- **History drill-through** — each history row links to the result (or exam) detail.
- **Appeal discoverability** — the Recursos empty state explains that appeals start from
  a published result and links to Resultados.
- **Explanatory empty states** — every empty screen says why it's empty and what's next.

Full detail: [Architecture & Product Closure](../student-examination-portal-v1.0-closure.md) ·
[CHANGELOG](../student-examination-portal-CHANGELOG.md) ·
[ADR-016](../adr/ADR-016-student-examination-portal-freeze.md).

---

## What's new

Students can now run their whole exam experience themselves — **without contacting the
secretariat**:

- **See what's coming** — a dashboard card and an Exames module show the next exam,
  exams this week, and results still to be published.
- **Open any exam** — subject, date, time, room, duration, the exam's instructions,
  your **eligibility** (and, if not eligible, the reason), and a simple
  Inscrito → Elegível → Realizado → Resultado publicado timeline.
- **Read published results** — with the exam's score and its **Percentagem do exame**
  (never presented as a final subject grade).
- **Appeal a result** — file an appeal against a published result with a single
  "Motivo do recurso", track its status and decision, and withdraw it (with a
  confirmation) while it's still pending.
- **Browse full history** — every exam you were registered for, including absences and
  exams without a published result, filterable by year / subject / status.

Every screen is in Portuguese, works on mobile, and only ever shows **your own**
published data.

---

## Compatibility

- **No data changes.** No database schema change and **no migration required**.
- **No new permissions.** Uses the existing `studentPortal.view` and the student's
  `exams.createAppeal` / `exams.withdrawAppeal`.
- **Compatible with existing modules.** Reads the frozen exam data; appeals reuse the
  existing engine commands. The Administration Portal and the Examination Engine are
  unaffected.

---

## Upgrade

Code-only release.

1. Deploy the build. **No migration step**, no configuration change, no data backfill.
2. After deploy, sign in as a student and confirm `/student/examinations` loads and the
   dashboard shows the "Exames" card.

**Rollback:** redeploy the previous build — immediate and lossless (no schema/data
change).

---

## Not in this release (v1.1+)

Pass/fail badges, appeal deadlines, PDF download, push notifications, external/Google
calendar, AI, and a structured Exam Policy domain are out of scope. UX polish (theme-
token colors, timeline `aria-current`, badge reconciliation, loading skeletons,
results/appeals search) is scheduled for v1.1. Rationale in
[ADR-016](../adr/ADR-016-student-examination-portal-freeze.md).

---

## Validation at release

`tsc --noEmit` ✓ (0) · module tests **18/18** · full suite green · `eslint` ✓ (0).
**No schema/migration change; no engine change.** Security Review passed (ownership,
published-only masking, fail-closed `notFound()`, no admin-endpoint reuse, no DTO
leakage).
