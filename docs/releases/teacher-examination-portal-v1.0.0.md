# Teacher Examination Portal v1.0.0 — 2026-07-19

**Status: Production Ready · Frozen · Maintenance.** The examiner/invigilator operational
surface — a dedicated `/teacher/examinations` module — over the Examination Engine
(amended by [ADR-017](../adr/ADR-017-assignment-scoped-teacher-execution.md) and
re-frozen). Frozen after a UX Audit (Overall 8.4/10, 0 Critical / 0 High, GO) and a
Security Review.

Full detail: [Architecture & Product Closure](../teacher-examination-portal-v1.0-closure.md) ·
[CHANGELOG](../teacher-examination-portal-CHANGELOG.md) ·
[ADR-018](../adr/ADR-018-teacher-examination-portal-freeze.md).

---

## What's delivered

A teacher can **run a complete exam session without the admin portal**:
- **See only their assigned sessions** — Resumo (next / today / pending work), a filtered
  Sessões list, and a session detail with their role and the session state.
- **Attendance** — mark present/absent/late in one click (justified/disqualified with a
  reason), correct a recorded attendance, and bulk "mark all pending present" (never
  overwrites).
- **Results** — enter a score for present candidates (absent/excused/disqualified are
  code-only, following the engine), save drafts, and submit — individually or in bulk.
- **Submission is the teacher's ceiling** — a confirmed, irreversible step; afterwards the
  teacher can read but not edit. Review, approval, publication and integration remain with
  the secretariat.

## Who can use it — supported roles

Access derives from an explicit exam-session assignment:

| Role | Attendance | Results |
|---|:---:|:---:|
| Vigilante-chefe (CHIEF) | ✅ | ✅ |
| Vigilante (INVIGILATOR) | ✅ | ❌ (read-only) |
| Corretor (MARKER) | ✅ | ✅ |
| Observador (OBSERVER) | ❌ read-only | ❌ read-only |

A teacher never sees or acts on a session they are not assigned to.

## Limits

The teacher flow ends at `SUBMITTED`. Not available (by design): creating periods/sessions,
registering candidates, assigning rooms/invigilators, review/approve/publish/integrate,
appeals, and admin operations. No pass/fail is shown (the engine owns none).

## Security

teacherId is always resolved server-side (never from the URL). Reads are scoped by
organization + active assignment and fail closed (a non-assigned session is a 404). Writes
are authorized **by the engine command inside the mutation transaction** (not merely the
endpoint or UI) — role and assignment are re-checked on every write. No admin/private
fields are exposed.

## Compatibility & upgrade

- **One new permission** (`exams.executeAssignedSessions`, granted to TEACHER, ADR-017).
  No other engine/schema/migration change.
- Code-only deploy. After deploy, sign in as an assigned teacher and confirm
  `/teacher/examinations` shows the session and its Assiduidade/Resultados sections.
- **Rollback:** redeploy the previous build (no data change).

## Validation at release

`tsc --noEmit` ✓ (0) · teacher module tests **25/25** · `eslint` ✓ (0) · engine gate tests
(ADR-017) green. Security Review passed (assignment-scoped reads, command-enforced writes,
fail-closed, no DTO leakage). Full suite green except the pre-existing flaky
grades/notifications files (pass in isolation).

## Known limitations (v1.1)

Back-link filter preservation, dialog descriptions, badge dark-mode tokens, keyboard
shortcuts, deeper tablet/mobile polish, controlled draft autosave, export/printable
attendance sheet, granular loading, browser-back navigation, operational analytics.
Rationale in [ADR-018](../adr/ADR-018-teacher-examination-portal-freeze.md).
