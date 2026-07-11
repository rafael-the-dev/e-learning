# Examination Administration Portal v1.0.0 — 2026-07-11 (tag `examination-portal-v1.0`)

**Status: IMPLEMENTED.** Phase 12 of the Examination Engine — the admin/secretary
administration portal (API layer, read services and React UI) over the **frozen** engine
backend (`examination-engine-v1.0.1`). No engine behaviour, schema or migration changed:
the portal is a read/command surface only. Governed by
[ADR-013](../adr/ADR-013-examination-engine.md) and
[ADR-014](../adr/ADR-014-exam-grade-component-binding.md); full design in
[docs/examination-engine.md](../examination-engine.md) §Phase 12.

## Architecture — the frontend decides nothing

The single invariant of this release: **the UI never owns business logic**. Every action a
user can take is gated by a **server-computed `allowedActions` flag**, never by a status
comparison in a component. The UI interprets `allowedActions.canApprove` (etc.) and always
surfaces the command's typed error — the backend command remains the sole authority, so a
rejected command is shown even when a button was enabled. Enforced by the static guard
`src/modules/examinations/components/__tests__/ui-architecture-guards.test.ts`: no
status-literal comparison and no repository / `@/server/db` import in any component or page.

Layering (per increment):
- **Increment 1–2 — backend spine.** Privacy-safe DTOs (`types/portal.ts`) with server-computed
  `allowedActions`; the pure mapper (`services/admin/examination-portal.mapper.ts`); a batched,
  tenant-scoped read-model repository (`repositories/exam-admin-read.repository.ts`, no N+1);
  11 read services under `services/admin/`; ~50 thin API routes under `app/api/examinations/**`
  (auth → delegate to a read service (GET) or a command (POST/PATCH) → `mapExaminationError`).
  Org is always resolved server-side (never from the URL).
- **Increment 3 — React UI.** Server pages guard (`requirePermissionOrRedirect`) + call the read
  services and pass DTOs to client tables/cards; mutations POST/PATCH to the thin routes and
  toast the command's error.

## What's in the portal

- **Dashboard** (`/examinations`) — KPIs, summaries, alerts and quick actions from
  `ExaminationAdminOverviewService` only (no recalculation).
- **Periods** — list + lifecycle (open/lock/complete/cancel) + create (`PeriodFormDialog`).
- **Rooms** — list + create/edit (`RoomFormDialog`) + archive.
- **Sessions** — list + create (`SessionFormDialog`); **detail with 7 tabs**: Visão geral
  (summary + lifecycle: schedule/lock/start/complete/cancel), Candidatos (register /
  register-with-override / withdraw / disqualify), Assiduidade (roster + KPIs + mark/correct),
  Resultados (create/edit draft + submit/review/approve/return, official-result overlay), 
  Publicação (`PublicationReadinessCard`), Integração (`IntegrationStatusCard`), Atividade
  (honest empty state — no activity read service is exposed by the frozen engine).
- **Appeals** — list + detail with the **original → current-official** visual comparison
  (append-only revisions listed; the published original is never overwritten) and the decision
  panel (review / approve-with-revised-score / reject).
- **Operations** (`exams.operationsView`) — detection-only: scheduling gaps (no room /
  invigilators / over-capacity / outside-period-window), room + invigilator conflicts, and
  integration-health KPIs.

The normalized exam score is always labelled **"Percentagem do exame"**, never "Nota Final" —
the portal never presents an exam percentage as a final subject grade.

## Reusable component library

`ExaminationStatusBadge` (+ `ResultStatusBadge` / `CandidateStatusBadge` / `AppealStatusBadge`),
`AllowedActionButton` (the one place a flag becomes a button → API call → error toast; optional
confirm / mandatory-reason dialog), `ExaminationPageHeader`, `ExaminationKpiCard`,
`ExaminationSummaryCard`, `PublicationReadinessCard`, `IntegrationStatusCard`,
`ExaminationDataTable`, `ExaminationEmptyState`, `ExaminationErrorState`, plus the section
tables/dialogs (`PeriodsTable`, `RoomsTable`, `SessionsTable`, `AppealsTable`, `CandidatesTab`,
`AttendanceTab`, `ResultsTab`, `AppealDecisionPanel`, `RoomFormDialog`, `PeriodFormDialog`,
`SessionFormDialog`). No permissions added — reuses the 22 existing `exams.*`.

## Data-privacy guarantees

No route/service/DTO exposes `eligibilitySnapshot`, `ExamEvent.metadata`, `AuditLog` blobs, or
Transcript/Certificate/Grade internals. Eligibility provenance is an allowlisted DTO
(`blockers`/`warnings`/`requiresApproval`/override fields), never the raw snapshot JSON.

## Known limitations (future enhancements — behaviour unaffected)

- Entity references for register-candidate and create-session are **id-based** (paste an id);
  a picker UI is a future enhancement. The commands validate every id, so correctness is
  unaffected.
- No Teacher/Student/Guardian exam portals (admin/secretary scope only).

## Validation at release

`tsc --noEmit` ✓ (0) · `vitest run src/modules/examinations` **809/809 (37 files, incl. the UI
architecture guard)** ✓ · `eslint` ✓ (0) · `prisma validate` ✓. **No schema/migration change.**

> The repo-wide `next build` fails on a **pre-existing, unrelated** circular import in the
> Prerequisites/Academic-Core module, tracked in
> [docs/bugs/BUG-PREREQ-001.md](../bugs/BUG-PREREQ-001.md). It has zero examination
> involvement and is out of scope for this release.
