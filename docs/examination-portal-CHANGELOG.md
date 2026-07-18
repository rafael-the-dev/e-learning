# Changelog — Examination Administration Portal

All notable changes to the Examination Administration Portal are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this
module follows [Semantic Versioning](https://semver.org/).

Scope: the admin/secretary portal (API routes, read services, DTOs, React UI) over the
frozen Examination Engine (`examination-engine-v1.0`). No engine behaviour, schema, or
migration is changed by any portal release.

---

## [1.1.0] — 2026-07-17

Scalability, productivity, and UX-gate release. Frozen as **Production Ready** after UX
Audit #3 (*YES WITH MINOR UX DEBT*, Overall UX 7.4/10, 0 Critical / 0 High open). See the
[closure document](examination-portal-v1.1-closure.md) and
[ADR-015](adr/ADR-015-examination-portal-freeze.md).

### Added
- **Bulk registration** — select-from-roster dialog with a pre-flight preview
  (eligible / already-registered / no-seat / seats) and a grouped skipped-vs-failed summary.
- **Bulk attendance** — whole-session "mark all present" over the entire roster (not just
  loaded rows), with a confirmation and a succeeded/skipped/failed summary.
- **Bulk results** — inline draft entry with a single upsert of all dirty rows; whole-session
  submit / review / approve (no need to select hundreds of rows).
- **Server-side search across deep joins** — sessions (by course/level/subject/room),
  appeals (by student/subject/session), candidates (by name/number/enrolment), periods.
- **Searchable entity pickers** (`EntityLookupCombobox`) for student, enrolment, period,
  level-subject, and room — with recents, keyboard navigation, and human sublabels.
- **Operations panel** — detection-only control view: scheduling gaps, room/invigilator
  conflicts, and integration-health KPIs, all searchable, all showing names not UUIDs.
- **Appeals** list search and the original→current-official comparison + decision panel.
- **PT-PT grade-integration states** — `FAILED` added to the central registry ("Falhou") and
  a progression-state vocabulary (Atual / Requer recálculo / Não executado).

### Improved
- **Pickers** — id-paste inputs replaced by searchable comboboxes across register-candidate
  and create-session flows (the v1.0.0 "id-based reference" limitation is resolved).
- **Optimistic UI** — attendance marking is optimistic with per-row rollback and inline
  error text on failure.
- **Directed refetch** — lifecycle actions refetch only the affected surface's read model
  (no global `router.refresh()` on the session workspace); tab/scroll preserved.
- **Integration UX** — integration tiles and the progression caption are now PT-PT via the
  central registry (single source shared with badges and filters).
- **Names over UUIDs** — Operations and appeals resolve session/room/invigilator/student
  names; UUIDs no longer surface on the main paths.

### Fixed
- **Publication confirmation (UX Audit #3, H1)** — `Publicar` now opens a confirmation
  dialog (shared `ConfirmDialog`) before publishing, matching the existing `Retirar
  publicação` behaviour. Publishing no longer fires on a single unguarded click.
- **Integration localisation (UX Audit #3, H2)** — the integration summary tiles rendered
  raw English keys (`current/missing/stale/…`) and a `FAILED` grade state fell through to a
  neutral English fallback badge; both are now PT-PT from the central registry.
- **UUID exposure** — residual raw-id displays in Operations/appeals/candidate rows replaced
  by resolved names.
- **Attendance scalability** — whole-session mark-all and server summaries keep the
  Attendance tab usable at 100–300 candidates.
- **Reload-heavy workflows** — full-page reloads on in-workspace actions replaced by directed
  refetches.

### Deferred to v1.2 (see [ADR-015](adr/ADR-015-examination-portal-freeze.md))
- First-class cross-session bulk integration; Outbox / notifications; teacher/student/guardian
  exam portals; UX micro-interactions (invigilator combobox, Attendance search, more filter
  dimensions, results stepper, table-paradigm convergence, sticky headers/sorting,
  click-through Operations KPIs); command palette.

### Notes
- **No schema or migration change.** No permissions added (reuses the 22 `exams.*`).
- Validation at freeze: `tsc --noEmit` ✓ · `vitest run src/modules/examinations` **821/821
  (41 files)** ✓ · `eslint` ✓.

---

## [1.0.0] — 2026-07-11

Initial Examination Administration Portal (Phase 12 of the Examination Engine). Full
details: [releases/examination-portal-v1.0.0.md](releases/examination-portal-v1.0.0.md).

### Added
- **Dashboard** (`/examinations`) — KPIs, summaries, alerts, quick actions.
- **Periods** — list + lifecycle (open/lock/complete/cancel) + create.
- **Rooms** — list + create/edit + archive (with future-session guard).
- **Sessions** — list + create; **detail with tabs**: Visão geral, Candidatos, Assiduidade,
  Resultados, Publicação, Integração, Atividade.
- **Appeals** — list + detail with original→current-official comparison and the decision
  panel.
- **Operations** (`exams.operationsView`) — detection-only scheduling/conflict/integration
  health.
- **Component library** — `ExaminationStatusBadge`, `AllowedActionButton`,
  `PublicationReadinessCard`, `IntegrationStatusCard`, `ExaminationDataTable`,
  `ExaminationEmptyState`/`ErrorState`, and the section tables/dialogs.

### Architecture
- **The frontend decides nothing** — every action gated by a server-computed
  `allowedActions` flag; enforced by a static UI architecture guard test.
- Read/write separation: batched tenant-scoped read services + pure DTO mapper (GET); engine
  commands (POST/PATCH). Org resolved server-side. Privacy-safe DTOs.

### Known limitations (at 1.0.0)
- Entity references were **id-based** (paste an id); picker UI was a future enhancement.
- No Teacher/Student/Guardian exam portals.

---

[1.1.0]: #110--2026-07-17
[1.0.0]: #100--2026-07-11
