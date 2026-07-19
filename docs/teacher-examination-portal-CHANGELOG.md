# Changelog — Teacher Examination Portal

Based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); follows
[Semantic Versioning](https://semver.org/). Scope: the teacher-facing
`/teacher/examinations` module over the Examination Engine (amended by ADR-017 and
re-frozen). No further engine behaviour, schema, or migration change is made by this
module.

---

## [1.0.0] — 2026-07-19

Initial Teacher Examination Portal. Frozen as **Production Ready** after a UX Audit
(Overall 8.4/10, 0 Critical / 0 High, GO) and a Security Review. Lifecycle →
**Maintenance**. See the [closure document](teacher-examination-portal-v1.0-closure.md)
and [ADR-018](adr/ADR-018-teacher-examination-portal-freeze.md).

### Engine hardening (prerequisite — [ADR-017](adr/ADR-017-assignment-scoped-teacher-execution.md))
- Implemented the deferred assignment-scoped teacher writes: `exams.executeAssignedSessions`
  + an in-transaction assignment+role gate on the mark/correct/enter/update/submit
  commands. Admin/secretary behaviour unchanged; Examination Engine re-frozen.

### Added — Foundation (reads)
- Dedicated `/teacher/examinations` module (Resumo, Sessões, Detalhe) with a secondary
  nav; visibility scoped exclusively by active `ExamInvigilatorAssignment`.
- **Resumo** — operational KPIs (próximo/hoje/presenças pendentes/resultados por lançar/
  por submeter), next-session highlight, today + recently-completed lists.
- **Sessões** — filtered (estado/disciplina/período/papel/pendência, URL-persisted) +
  server-side paginated list; role/state/progress/próxima-acção per row.
- **Detalhe** — header (role + state badges), info, instructions, capabilities panel;
  fail-closed `notFound()` when not assigned.
- Dashboard `TeacherExamSummaryCard` + "Exames" nav entry (`teacherPortal.view`).

### Added — Attendance (writes)
- Teacher endpoints (mark / correct / bulk / roster GET) over the hardened commands.
- Interactive attendance section: counters, search, status filter, sticky table,
  capability-gated inline P/A/L (reason dialog for EXCUSED/DISQUALIFIED), correction,
  and bulk (mark-selected / mark-all-pending / clear + summary). Bulk never overwrites.

### Added — Results (writes → SUBMITTED)
- Teacher endpoints (create / update-draft / submit / bulk-create / bulk-submit / roster
  GET) over the hardened commands. Teacher ceiling is `SUBMITTED`.
- Interactive results section: session max-score, counters, search/filter, sticky grid;
  attendance→result rule followed exactly (SCORED numeric; ABSENT/EXCUSED code-only;
  DISQUALIFIED code + reason; no PASSED/FAILED); draft edit + submit (confirm); bulk save
  and bulk submit (confirm) with per-candidate summaries.
- Per-candidate + session-level result capabilities.

### Security
- teacherId always server-resolved; reads scoped by org + assignment; writes enforced by
  the command in-tx (not the endpoint); fail-closed `notFound()`; no DTO leakage of
  admin/private fields; TEACHER holds no review/approve/publish/integrate.

### Fixed — UX remediation (before freeze)
- Filtered sessions list now shows "no filter match" (not "no assignments").
- `aria-current="page"` on the active nav tab.
- Accessible names on the attendance/results section search inputs.

### Removed
- `TeacherCandidatesTable` (orphaned after the interactive attendance section replaced it).

### Notes
- No new engine behaviour/schema/migration in this module; one new permission
  (`exams.executeAssignedSessions`, ADR-017). Validation: `tsc` 0 · module tests 25/25 ·
  `eslint` clean.

### Deferred to v1.1 (see [ADR-018](adr/ADR-018-teacher-examination-portal-freeze.md))
- Back-link filter preservation; dialog descriptions; badge theme-tokens/dark-mode; hide
  results scaffold for blocked roles; trim dormant admin labels; keyboard shortcuts;
  mobile/tablet-compact polish; autosave; export/printable attendance; granular loading;
  browser-back nav; analytics. No engine change without a new ADR.

---

[1.0.0]: #100--2026-07-19
