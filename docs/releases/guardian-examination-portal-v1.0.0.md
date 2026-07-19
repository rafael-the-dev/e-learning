# Guardian Examination Portal v1.0.0 — 2026-07-19

**Status: Production Ready · Frozen · Maintenance.** The encarregado de educação
**supervision** surface — a dedicated `/guardian/examinations` module — over the
Examination Engine (**unchanged**). Frozen after a UX Audit (Overall 7.8/10, 0 Critical /
0 High, GO) and a Security Review. The **fourth and final** portal on the engine.

Full detail: [Architecture & Product Closure](../guardian-examination-portal-v1.0-closure.md) ·
[CHANGELOG](../guardian-examination-portal-CHANGELOG.md) ·
[ADR-019](../adr/ADR-019-guardian-examination-portal-freeze.md).

---

## What's delivered

A guardian can **follow the full exam cycle of each linked student without the student or
admin portal**:
- **Resumo** — one card per linked student (primary first): next exam, exams this week,
  latest **published** results, pending appeals and alerts.
- **Detalhe** — one exam: session info, instructions, attendance (when permitted), the
  published result (as a percentage), and the appeal **status**.
- **Histórico** — pick an educando, filter by ano / disciplina / estado (shareable URLs),
  page through a full drill-through history.
- **100% read-only** — there is no button, form, or endpoint to change anything. This is a
  supervision experience, not a second student portal.

## Who can see what — per-link visibility

Access derives from an active `GuardianStudent` link, and granularity from its flags:

| Data | Visible when |
|---|---|
| Exam schedule / results / appeals / history | `canViewAcademic` is set |
| Attendance (presence) | `canViewAttendance` is set |

A guardian only sees students they are linked to; without `canViewAcademic` the student's
exam data is withheld entirely; without `canViewAttendance` the attendance section/column is
hidden.

## Limits

Read-only supervision only. Not available (by design): any write (attendance, results,
appeals create/withdraw), scheduling, messaging, finance/documents, and multi-educando
comparison. Results are shown as a percentage; no pass/fail is derived (the engine owns
none). Appeals are shown as status only (never the private decision reason).

## Security

guardianUserId is always resolved server-side (never from the URL). Every read is gated by
a `GuardianStudent` link check **before** any exam data is touched; a studentId in the URL
is only a selection and is validated against the guardian's links. Visibility flags are
applied before exposure, results are masked to PUBLISHED, and every unlinked / other-guardian
/ other-org / inactive-link / no-visibility case fails closed to a 404. There is **no write
endpoint and no mutation affordance** anywhere in the portal.

## Compatibility & upgrade

- **No engine/schema/migration/permission change.** The GUARDIAN role already has
  `guardianPortal.view`; the module reuses existing tables and the student read layer.
- Code-only deploy. After deploy, sign in as a guardian with a linked student and confirm
  `/guardian/examinations` shows the Resumo, a detail, and the Histórico.
- **Rollback:** redeploy the previous build (no data change).

## Validation at release

`tsc --noEmit` ✓ (0) · guardian module tests **15/15** · `eslint` ✓ (0). Security Review
passed (link-scoped reads, flag-gated exposure, published-only, fail-closed, no write
surface, no DTO leakage). Full suite green except the pre-existing flaky grades/notifications
files (pass in isolation). The freeze validation also fixed two pre-existing `tsc` errors
elsewhere (masked by an earlier heap-OOM) to keep the tree green — behaviour unchanged.

## Known limitations (v1.1)

Active nav-tab state on detail, `aria-current`, a student caption above the history table,
empty-state unification, badge dark-mode tokens (system-wide), loading skeletons, a friendly
"sem visibilidade" message instead of a raw 404; product-level: multi-educando comparison,
finance/documents supervision, notification deep-links. Rationale in
[ADR-019](../adr/ADR-019-guardian-examination-portal-freeze.md).
