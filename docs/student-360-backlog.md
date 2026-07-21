# Student 360 — Backlog & Deferred Debt

Provenance: the architectural review of 2026-07-20. The canonical read-model trilogy is
done — **H1** finance permission boundary, **H2** grade average, **H5** attendance %,
**H6** risk engine (see [CHANGELOG](student-360-CHANGELOG.md)). This file tracks what was
deliberately deferred, so the review's conclusions don't live only in chat.

---

## M11 — Dashboard Risk Aggregation Convergence

**Status:** open debt · **Severity:** Medium · **Does NOT block current hardening.**

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

- **H3 — Finance statement eager + unbounded.** `getStudentFinancialStatement` load-alls
  invoices/payments/receipts/refunds/wallet-txns and JS-reduces KPIs; fetched eagerly in
  the Student 360 core. Lives in `reports/finance`. Fix: lazy (only `?tab=finance`),
  server pagination, `aggregate({_sum})`.
- **H4 — Eligibility N+1.** `evaluateEligibilityForAllSubjects` (~5 queries/subject) in
  the Progress tab. Lives in `prerequisites`. Fix: batch the enrollment + progress +
  prerequisite loads.
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
