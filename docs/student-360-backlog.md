# Student 360 — Backlog & Deferred Debt

Provenance: the architectural review of 2026-07-20. The canonical read-model trilogy is
done — **H1** finance permission boundary, **H2** grade average, **H5** attendance %,
**H6** risk engine (see [CHANGELOG](student-360-CHANGELOG.md)). This file tracks what was
deliberately deferred, so the review's conclusions don't live only in chat.

---

## M11 — Dashboard Risk Aggregation Convergence

**Status:** MOSTLY DONE — M11.1/M11.2/M11.3/M11.4 landed; only the post-backfill legacy
removal + anti-threshold architecture tests remain (gated on a real deploy backfill) ·
**Severity:** Medium.

**Progress:**
- **M11.1 — projection contract (DONE).** `StudentRiskProjection` model + SQL Server
  migration; shared risk semantics exported from the engine (`RISK_LEVEL_ORDER`,
  `riskLevelRank`, `isRiskLevelAtRisk`, `STUDENT_RISK_SOURCE_VERSION`); repository (single
  writer `upsertStudentRiskProjection` + `getStudentRiskLevelCounts` /
  `findStudentRiskWatchlist` / `findStudentIdsWithStaleRiskProjection`, finance-blind reads
  over `levelWithoutFinance`). Stores the H6 pair `level` + `levelWithoutFinance` + ranks.
- **M11.2 — recalculation service (DONE).** `recalculateStudentRiskProjection()` uses the
  SAME H6 engine + shared `assembleStudentRiskInput` (extracted; `getStudent360Core`
  repointed to it), runs the engine twice (with/without finance), idempotent, tenant-guarded.
- **M11.3 — dashboard migration (DONE).** Executive dashboard (`studentsAtRisk` +
  `studentsLowAttendance`), students-module counts, grades `atRiskStudentCount` and the
  teacher-portal attendance risk all read the projection (coverage-gated, legacy fallback).
  Secretary + finance-debt reviewed and left as operational (no divergent 75/85 threshold).
- **M11.4 — backfill + wiring + reconciliation (DONE, except the deferred cleanup).**
  `prisma/backfill-student-risk-projection.ts` + `db:backfill-student-risk-projection`
  (idempotent, batched, per-org, `--stale`); `reconcileStudentRiskProjectionsForOrg`
  (all-active or stale-version); `StudentRiskProjectionHandler` on the event bus
  (attendance.summary_recalculated + payment.confirmed → synchronous post-commit recalc;
  academic/progression/document changes are covered by reconciliation until their events
  carry a studentId).
- **M11.4 remainder — DEFERRED to the deploy (still open).** Removing the legacy SQL
  classifications (and the flat-75/85 fallbacks) and adding the architecture tests that
  forbid duplicated thresholds must wait until a **real backfill + parity comparison** has
  run against production data (per the plan: "executar backfill; comparar resultados;
  remover classificações SQL antigas"). Removing the read-through fallback before that would
  reintroduce the false-zero risk, so it is intentionally NOT done in code yet.

**Sequencing note:** the projection table is EMPTY until the backfill (M11.4) runs, so
flipping the dashboards (M11.3) to read it before backfill+hooks land would show 0 at-risk
students in the interim. Real-world deploy order should be: apply migration → backfill →
enable command hooks → flip dashboards → remove legacy. Code-commit order can still be
M11.3→M11.4 as long as the deploy runbook backfills before the dashboard flip is released.

### Post-review remediation status (review 2026-07-21)
- **F-H1 — coverage gate incompleteness → DONE.** Replaced the `count > 0` gate with a
  completeness-based, fail-closed `StudentRiskProjectionCoverage` rollout state +
  `getStudentRiskProjectionCoverage()` (READY only after a full backfill/reconcile at the
  current version AND a live zero-uncovered re-check; event handler cannot promote READY;
  completeness measured over students so orphans can't compensate; single shared eligible-
  student predicate). See CHANGELOG. This also subsumes the "false-zero" facet of the gate.
- **F-H2 — event coverage → DONE.** `StudentRiskProjectionHandler` now subscribes to a
  centralized contract of all direct risk mutations (academic / attendance incl.
  justifications / payment+refund / enrolment+progression / documents / per-student waivers),
  all post-commit with a payload `studentId`. New events emitted at canonical points
  (`STUDENT_LEVEL_PROGRESSION_CHANGED`, `ENROLLMENT_CANCELLED/COMPLETED`,
  `STUDENT_DOCUMENT_STATUS_CHANGED`, `STUDENT_PREREQUISITE_WAIVER_CHANGED`) + `studentId`
  added to refund reject/complete. Best-effort (never rolls back the mutation), idempotent
  dedup, coverage state untouched by events. See CHANGELOG. **Still deferred to F-H3:** the
  temporal `INVOICE_OVERDUE` trigger (dueDate + job), document expiry, policy fan-out, and
  lost/failed-event recovery.
- **F-H3 — reconcile scheduling + temporal risk → DONE.** Scheduled `runReconcileRiskProjectionsJob`
  + cron route (`/api/internal/jobs/reconcile-risk-projections`, secret-gated), per-org
  sequential + failure-isolated + overlap-guarded, full sweep owns coverage. Reconcile modes
  split into `all`/`missing`/`version-stale` (CLI `--all`/`--missing`/`--version-stale`,
  non-zero exit on partial failure). Daily billing job emits `INVOICE_OVERDUE` per newly-
  overdue student; handler subscribes. Document-expiry / policy-fan-out / lost-event recovery
  documented as reconcile-covered (batch, never synchronous). See CHANGELOG.
- **Still open from the review (not this change):** F-H4 (backfill not
  cursor-batched/resumable for very large tenants),
  F-M1 (overdue status-only vs `dueDate < now`), F-M2 (soft-deleted rows still counted on
  reads / name leak), F-M4 (synchronous recompute burst), F-M6 (non-finance card/alert
  permission gating), F-M7 (pager aria-labels), plus the Lows. F-L4 (unused var) fixed here.

### Context
H6 introduced the single canonical per-student risk engine (`buildStudentRiskSummary` →
`StudentRiskSummary`) and pointed the **per-student surfaces** (Student 360 alerts panel,
overview risk chips, health-card reasons) at it. That closed the original problem: two
surfaces producing **divergent risk classifications for the same student**.

The **SQL-aggregate dashboards/watchlists** were intentionally left out. They rank/count
at-risk students across the whole org (or a teacher's roster) and are therefore a
different consumption pattern from a per-student read model. This is **not** a gap in the
H6 resolution — it is separate debt.

### The divergences that remain (from the review)
- **Attendance threshold.** Per-student surfaces use the per-subject
  `LevelSubject.minimumAttendancePercentage` (`SubjectAttendanceView.status === "BELOW_REQUIRED"`).
  The dashboards use a **flat 75%** (and the teacher portal **85%**) against the legacy
  `StudentSubjectProgress.attendancePercentage`. A student at 78% with an 80% subject
  minimum is at-risk in Student 360 but not on the dashboard, and MEDIUM on the teacher
  portal — three answers.
- **"Overdue" is defined three ways** across sites: `status === "OVERDUE"` vs
  `dueDate < now` vs `dueDate < now OR status = 'OVERDUE'`.
- **Severity vocabularies** differ (`CRITICAL/HIGH/MEDIUM` vs lowercase
  `critical/high/medium/low` vs attendance `BELOW_REQUIRED/AT_RISK/OK`).

### Affected sites (SQL-aggregate; flat thresholds on the legacy field)
- `src/modules/dashboard/services/dashboard-academic.repository.ts` (studentsLowAttendance / studentsAtRisk / watchlist)
- `src/modules/dashboard/services/academic-risk.service.ts`
- `src/modules/dashboard/services/progress-dashboard-watchlist.service.ts`
- `src/modules/teachers/teacher-portal/**` (low-attendance / at-risk lists; `LOW_ATTENDANCE_THRESHOLD=75`, `ATTENDANCE_TREND_THRESHOLD=85`)
- `src/modules/reports/finance/repositories/student-debt.repository.ts`, `src/modules/secretary-portal/**`, `src/modules/dashboard/**` financial watchlists
- `src/modules/students/repositories/student.repository.ts` (`countStudentsWithLowAttendance`, default `threshold = 75`)

### What NOT to do
Do **not** resolve this by calling `buildStudentRiskSummary()` per student inside a
dashboard query. Materializing every student's full input bundle (finance statement +
attendance summary + progress) per row is exactly the **N-query blow-up** the SQL
aggregates were written to avoid.

### Future approaches (pick one; listed least → most mature)
1. **Shared SQL-safe constants (interim).** Extract the thresholds + the overdue
   definition + the severity ladder into one constants module that both the per-student
   engine and the SQL aggregates import. Kills the duplicated `75`/`85` literals so the
   *numbers* match — but the dashboards still aggregate over the **legacy** attendance
   field, so the *decision* (per-subject minimum vs flat) can still differ.
2. **Aggregate over the canonical persisted status column.** Point the dashboards at the
   attendance module's persisted `StudentSubjectAttendanceSummary.status` (already the
   canonical `BELOW_REQUIRED` decision) instead of re-deriving a flat % on the legacy
   field. Lets the dashboards `WHERE`/`GROUP BY` the *same* decision without per-student
   queries.
3. **Persisted risk projection (preferred, most mature).** A `StudentRiskProjection`
   read table holding the canonical per-student classification, updated by domain events:

   ```
   grades / attendance / progression / finance
                     │  (change events)
                     ▼
            StudentRiskProjection   ← the canonical classification, persisted
                     │
        ┌────────────┼───────────────┐
        ▼            ▼                ▼
   Student 360   dashboards      watchlists
   ```

   Student 360 keeps reading the live engine (or the projection); dashboards/watchlists
   read the projection with cheap `WHERE`/`ORDER BY`/`GROUP BY`. One classification,
   consumed everywhere, with no N-query cost. The risk RULES stay defined once (the H6
   engine); the projection is just its persisted, event-updated output.

### Acceptance (when this is picked up)
Same student → same risk level on Student 360, the executive dashboard, the secretary
portal and the teacher watchlist; no duplicated threshold literals; dashboards aggregate
over the canonical decision (not the legacy flat %).

---

## Other deferred items (from the same review)

Brief pointers so the review's remaining findings have one home.

- ~~**H3 — Finance statement eager + unbounded.**~~ **DONE** — `core.finance` now carries
  SQL-aggregated summaries only (`getStudentFinanceSummary`), the history is paged (M2), and
  the overview no longer loads the statement. See CHANGELOG.
- ~~**H4 — Eligibility N+1.**~~ **DONE** — the Progress-tab whole-level evaluation is now a
  constant-query **batch loader** (`loadEligibilityEvaluationContext`) feeding a **pure**
  `evaluateEligibilityForAllSubjects(context)` (no IO, no per-subject round-trip); the
  student's progress is loaded once by student so transitive (out-of-level) prerequisites are
  covered. Outputs unchanged (data-access optimization, not an engine revision). See CHANGELOG.
- **Mediums.** Raw reviewer UUID in the attendance justifications table; `refundMethod`
  rendered as a raw enum; header action overload.
  *(Resolved: cross-module prerequisites repo duplication — M1; finance-tab client-side
  pagination shipping the full history — M2; transcript page missing the teacher-scope IDOR
  guard — done, see CHANGELOG "Security (IDOR)".)*
- **H5 leftovers.** Precise **unjustified-absence count** (the persisted rollup's excused
  count overlaps absences/lateness — needs a dedicated field); the portals' **monthly
  attendance trend** stays raw (per-month grain); the **teacher portal** reads a third,
  enforcement-gated attendance field.
- **Lows.** Health-card weights vs service; no `core` caching across tab switches; no
  granular Suspense; `findLastActivityAt` index; browser-tab title is the UUID; dead
  whitespace when no alerts; `formatCurrency` duplicated; stale [docs/student-360.md]
  (says teacher scoping not implemented, but it is).
