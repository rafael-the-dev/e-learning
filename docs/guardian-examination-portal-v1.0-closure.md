# Guardian Examination Portal — Architecture & Product Closure (v1.0.0)

> **Official closure document for the Guardian Examination Portal.** It consolidates, at
> freeze time, what the module does, how it is built, why the key decisions were made,
> and what was intentionally left for v1.1. A maintainer 6–12 months out should be able
> to understand and evolve it from this document.

---

## 1. Introduction

| | |
|---|---|
| **Module** | Guardian Examination Portal (the encarregado de educação **supervision** surface) |
| **Version** | **v1.0.0** |
| **Status** | **Production Ready · Frozen** — UX Audit Overall **7.8/10**, 0 Critical / 0 High, verdict GO |
| **Lifecycle** | **Maintenance** |
| **Date** | 2026-07-19 |
| **Runs over** | The Examination Engine, **unchanged**. No engine behaviour, schema, migration, or new permission is introduced by this module. |
| **Siblings** | [Examination Administration Portal v1.1.0](examination-portal-v1.1-closure.md), [Student Examination Portal v1.0.1](student-examination-portal-v1.0-closure.md), [Teacher Examination Portal v1.0.0](teacher-examination-portal-v1.0-closure.md) — all frozen. This is the **fourth and final** portal on the engine. |

### Purpose

Let a guardian **follow the complete exam cycle of each linked student — upcoming exams,
exam details, results and appeals status, and full history — without the student or admin
portal**, strictly scoped by their `GuardianStudent` links and per-link visibility flags,
and strictly **read-only**.

### Scope

**In scope:** a dedicated `/guardian/examinations` module (own supervision DTOs + service +
UI) with three surfaces — **Resumo** (per-student overview), **Detalhe** (one exam), and
**Histórico** (per-student, filtered) — plus a dashboard summary card.

**Out of scope (by design):** every write. No attendance, no results, no create/withdraw
appeal, no scheduling, no messaging — the portal exposes **no mutation affordance and no
write endpoint at all**. It is a supervision (acompanhamento) experience, not a second
student portal and not a mirror of admin.

---

## 2. Architecture

A read-only, link-scoped stack. Visibility is resolved from the guardian's links; the
data itself is read through the already-tested student read layer.

```
UI (server pages guarded by GUARDIAN_PORTAL_VIEW; only the history pager is a client cpt)
      ↓ reads (no writes anywhere)
Service guardianExaminationService
  (org + guardianUserId → links → per-link flag gate → data)
      ↓
Repositories:
  guardian-portal.repository   → findGuardianLinks / findGuardianLink  (the AUTHORITY on
                                  who may be supervised + the visibility flags)
  exam-candidate.repository    → findExamCandidateById (org-scoped, resolves candidacy→studentId)
  student-exam.repository      → studentId-scoped reads (REUSED as the data-access layer)
      ↓
Prisma 7 → SQL Server (reuses exam_* + guardian_student tables; NO new models, NO engine change)
```

**Own supervision contract, REUSED data primitive.** The module has its own DTOs and
service (no import of admin `types/portal.ts`, admin read services, or the student
module's DTOs). Its **data layer is the tested `student-examinations` repository** —
studentId-scoped reads (`listStudentCandidacies`, `countPendingAppeals`,
`findStudentCandidacy`, `findLatestAppealForResult`, `listStudentHistory`,
`countStudentHistory`, `listStudentHistoryFacets`, `listStudentAppeals`). This is safe and
DRY because the `studentId` handed to those reads is **always a validated linked student**,
never an id from the URL. Reusing a low-level data primitive is not reusing a portal
contract.

---

## 3. Supervision model

Guardian visibility derives **exclusively** from an active `GuardianStudent` link, and its
granularity from that link's per-link flags:

| Exam data | Gated by |
|---|---|
| Schedule / results / appeals / history (academic) | `canViewAcademic` |
| Attendance (presence per exam / column) | `canViewAttendance` |

- `guardianUserId` is **always** `context.userId` (the authenticated guardian) — never from
  the URL or input.
- `studentId` in a URL is **only a selection**; it is validated against the guardian's links
  server-side (`findGuardianLink`). An invalid/unlinked selection fails closed.
- A link without `canViewAcademic` withholds **all** exam academic data (the exam read layer
  is never even queried for that student).
- A link with `canViewAcademic` but without `canViewAttendance` shows academic data but
  **hides the attendance section entirely** (in detail) and the **Presença column** (in
  history) — hidden, not blanked.

The GUARDIAN role holds only `guardianPortal.view` (+ own notifications). It holds **no
`exams.*` permission** — there is nothing to write.

---

## 4. Routes

- `/guardian/examinations` — **Resumo**: one supervision card per active link (primary
  first). Each card shows next exam, exams-this-week, latest **published** results, pending
  appeals and alerts — or a muted "sem visibilidade académica" state when `canViewAcademic`
  is false. Unlinked guardians get an actionable empty state.
- `/guardian/examinations/[examId]` — **Detalhe** (`examId` = examCandidateId, the canonical
  entity, mirroring the student portal): header (student + relationship), session info,
  free-text instructions, attendance (only when `canViewAttendance`), the **published**
  result, and the appeal **status** (read-only). Fail-closed `notFound()` for any
  unlinked/other-org/no-academic-visibility case.
- `/guardian/examinations/history` — **Histórico**: an "Educando" selector (academic-visible
  links only) + URL-persisted filters (student / ano / disciplina / estado / page) + a
  server-paginated, drill-through table. Distinct empty states for "no academic-visible
  student", "no history", and "no filter match".
- A `GuardianExamSummaryCard` on the `/guardian` dashboard + an "Exames" nav entry
  (`guardianPortal.view`).

---

## 5. Endpoints

**None.** The portal is entirely server-rendered reads; there is **no `/api/guardian/**`**
surface and no client mutation. The only client interactivity is navigation (the history
pager's prev/next and the filter/drill-through links). This is the defining security
property of the module: there is no write path to attack.

---

## 6. What the guardian sees (and never sees)

- **Results:** PUBLISHED-only, and always labelled as a percentage ("Percentagem do exame"),
  never "Nota Final". No draft/submitted/under-review result is ever exposed. No PASSED/FAILED
  is derived (the engine owns none).
- **Appeals:** status only — estado, public decision (the outcome enum), submitted/decided
  dates. Never the private `decisionReason`, and no create/withdraw affordance.
- **Attendance:** only when `canViewAttendance`; otherwise absent from the UI.
- **Never:** reviewer/approver/publisher ids, `decisionReason`, `markerId`, audit/integration
  payloads, admin `allowedActions`, or the raw eligibility snapshot. The supervision DTOs
  simply do not carry these fields.

---

## 7. Flows

```
/guardian dashboard (Exames card) → Resumo (per-student cards)
   → card next-exam / result  → exam Detalhe → Voltar (returns to Resumo)
   → Histórico (pick educando, filter) → Ver → exam Detalhe → Voltar (returns to Histórico,
      selection + filters preserved)
```

No dead ends: every terminal view has a working back-link, and the back-link now preserves
the origin (Resumo vs the exact History selection/filters).

---

## 8. Security

| Invariant | How |
|---|---|
| **Link scoping** | Every read passes through `findGuardianLinks`/`findGuardianLink` (org + guardianUserId + studentId) **before** any exam data is touched. |
| **guardianUserId server-resolved** | Always `context.userId`; never from the URL/body. |
| **studentId validated, never trusted** | A URL `student`/`examId` is only a selection; the link (and its `canViewAcademic`) is validated server-side. Invalid → `notFound()`, no silent fallback to another child. |
| **Flag gating before exposure** | `canViewAcademic` withholds all academic data (read layer not queried); `canViewAttendance` hides the attendance section/column. |
| **Fail closed** | Not-linked / other-guardian / other-org / inactive-link / no-academic-visibility → null → `notFound()` (404). Never a 403/500 that leaks existence. |
| **Published-only** | Results are masked to PUBLISHED in the service before the DTO is built. |
| **No write surface** | No `/api/guardian/**`, no fetch/POST/PATCH/DELETE, no mutation affordance anywhere. |
| **No DTO leakage** | Supervision DTOs never carry reviewer/approver/publisher ids, `decisionReason`, `markerId`, audit, integration payloads, admin `allowedActions`, or the raw eligibility snapshot. |

---

## 9. Tests

- **Guardian module (15):**
  - **Overview (4):** no links; `canViewAcademic=false` withholds all exam data; academic
    summary (next/this-week/latest-published/pending appeals/alerts); multi-student (primary
    first).
  - **Detalhe (6):** not-linked → null; other-org candidacy → null; inactive link → null;
    `canViewAcademic=false` → null; `canViewAttendance=false` hides attendance; published-only
    result + read-only appeal status.
  - **Histórico (5):** validated link; `canViewAcademic=false` → null; `canViewAttendance=false`
    hides the Presença column; facets scoped to the selected student; server pagination.
- Validation at freeze: `tsc --noEmit` **0** errors · guardian module **15/15** · `eslint`
  clean. Full suite green except the pre-existing flaky grades/notifications files (pass in
  isolation, unrelated to this module).

---

## 10. UX Audit + remediation

Overall **7.8/10**, 0 Critical / 0 High, **GO** (weighted: Supervisão 9, Security-UX 9,
Clareza 8, Responsividade 8, Navegação 7, Multi-educando 7, Acessibilidade 6). Central
question — *can a guardian follow the entire exam cycle without the student/admin portal,
no dead ends?* — answered **YES**. Fixed before freeze:

- **M1 — "Voltar" now preserves origin.** The detail back-link reads a validated internal
  `back` param; history rows forward the current student+filters, so returning from a
  History→detail→History loop keeps the selection instead of dropping the guardian on Resumo.
  The param is a navigation hint only, accepted **solely** when it is an internal
  `/guardian/examinations` path (no open-redirect surface).
- **M2 — Stale per-student filters self-heal.** Facets are per-student; a year/disciplina
  carried over from a previous educando (the shared filter bar resets only `page`) would
  produce a false "Nenhum exame corresponde aos filtros." The history page now drops any
  filter value absent from the selected student's facets and reloads clean.
- **L4 — "Ação" → "Detalhe".** The read-only history table's last column no longer implies
  an action exists.

## 11. Known debt (v1.1 backlog)

Non-blocking, deferred (all Low): no active nav-tab state while on a detail page (**L1**);
`aria-current="page"` on the nav (**L2**); a heading/caption naming the selected student
above the history table (**L3**); unify the two empty-state components used across the portal
(**L5**); migrate hardcoded badge/alert palettes to theme tokens with dark-mode — **system-
wide**, not portal-specific (**L6**); loading skeletons on server navigations (**L7**); a
friendly "sem visibilidade" message instead of a raw 404 when a link loses academic
visibility mid-session (**L8**). Product-level v1.1 candidates: multi-educando comparison,
finance/documents supervision surfaces, notification deep-links. **No engine change without a
new ADR.**

---

## Closure statement

The Guardian Examination Portal is **frozen at v1.0.0 · Production Ready · Maintenance**. A
guardian can follow the full exam cycle of each linked student — upcoming, detail, results,
appeals status, and history — without the student or admin portal, strictly link- and
flag-scoped, published-only, fail-closed, and **100% read-only** (no write endpoint, no
mutation affordance). With this, the exam ecosystem is complete: **four frozen portals
(admin + student + teacher + guardian) over one unchanged engine.** The v1.1 backlog (§11)
is separated from this release.

**Related:** [ADR-019](adr/ADR-019-guardian-examination-portal-freeze.md) ·
[CHANGELOG](guardian-examination-portal-CHANGELOG.md) ·
[Release Notes v1.0.0](releases/guardian-examination-portal-v1.0.0.md).
