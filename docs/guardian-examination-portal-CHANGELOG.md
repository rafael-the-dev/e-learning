# Changelog — Guardian Examination Portal

Based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); follows
[Semantic Versioning](https://semver.org/). Scope: the guardian-facing
`/guardian/examinations` supervision module over the Examination Engine. This module makes
**no** engine behaviour, schema, migration, or permission change.

---

## [1.0.0] — 2026-07-19

Initial Guardian Examination Portal. Frozen as **Production Ready** after a UX Audit
(Overall 7.8/10, 0 Critical / 0 High, GO) and a Security Review. Lifecycle →
**Maintenance**. The **fourth and final** portal on the Examination Engine, completing the
exam ecosystem (admin + student + teacher + guardian). See the
[closure document](guardian-examination-portal-v1.0-closure.md) and
[ADR-019](adr/ADR-019-guardian-examination-portal-freeze.md).

### Added — Resumo (Sprint 1)
- Dedicated `/guardian/examinations` module (own supervision DTOs + service) with an
  "Exames" nav entry (`guardianPortal.view`) and a `GuardianExamSummaryCard` on `/guardian`.
- **Resumo** — one supervision card per active `GuardianStudent` link (primary first): next
  exam, exams-this-week, latest **published** results, pending appeals, alerts. Withholds
  **all** exam data when the link's `canViewAcademic` is false (the exam read layer is never
  queried). Actionable empty state for unlinked guardians.

### Added — Detalhe (Sprint 2)
- `/guardian/examinations/[examId]` (`examId` = examCandidateId, canonical entity). The
  candidacy's `studentId` is resolved server-side and validated against the guardian's links
  — never taken from the URL. Session info + free-text instructions; **attendance only when
  `canViewAttendance`**; **published-only** result; **read-only appeal status** (estado,
  public decision, dates — never the private `decisionReason`); no create/withdraw.

### Added — Histórico (Sprint 3)
- `/guardian/examinations/history` — an "Educando" selector (academic-visible links only) +
  URL-persisted filters (student / ano / disciplina / estado / page) + a server-paginated,
  drill-through table. Facets scoped to the selected student; results published-only;
  attendance column hidden when `canViewAttendance` is false; appeal status per row. Distinct
  empty states for "no academic-visible student" / "no history" / "no filter match".
  Fail-closed `notFound()` on an explicit invalid `student` selection (no silent fallback).

### Security
- guardianUserId always server-resolved (`context.userId`); every read passes a link check
  (`findGuardianLinks`/`findGuardianLink`) before any exam data is touched; studentId validated,
  never trusted; `canViewAcademic`/`canViewAttendance` gating applied **before** exposure;
  results masked to PUBLISHED; **no `/api/guardian/**` and no mutation affordance anywhere**;
  no DTO leakage of admin/private fields.

### Fixed — UX remediation (before freeze)
- **"Voltar" preserves origin** — the detail back-link reads a validated internal `back`
  param and history rows forward the current student+filters, so History→detail→History
  keeps the selection (previously always dropped the guardian on Resumo).
- **Stale per-student filters self-heal** — the history page drops any year/disciplina absent
  from the selected student's facets and reloads clean, preventing a false "Nenhum exame
  corresponde aos filtros." after switching educando.
- **"Ação" → "Detalhe"** — the read-only history table's last column no longer implies an
  action.

### Notes
- No engine behaviour/schema/migration/permission change in this module (reuses the
  `student-examinations` repository as a validated, studentId-scoped data primitive).
- The freeze validation surfaced two **pre-existing** `tsc` errors elsewhere (masked by a
  heap-OOM in earlier runs) and fixed them to keep the tree green: teacher attendance route
  now coerces the ISO `checkedInAt` string to `Date` before the command; the student
  exam-detail period fallback parenthesises its `??`/`||` expression. Behaviour unchanged.
- Validation: `tsc` **0** · guardian module tests **15/15** · `eslint` clean.

### Deferred to v1.1 (see [ADR-019](adr/ADR-019-guardian-examination-portal-freeze.md))
- Active nav-tab state on detail; `aria-current`; a student caption above the history table;
  empty-state component unification; badge/alert theme-tokens + dark-mode (system-wide);
  loading skeletons; friendly "sem visibilidade" message instead of a raw 404. Product-level:
  multi-educando comparison, finance/documents supervision, notification deep-links. No engine
  change without a new ADR.

---

[1.0.0]: #100--2026-07-19
