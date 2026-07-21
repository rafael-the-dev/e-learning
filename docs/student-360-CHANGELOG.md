# Changelog — Student 360

Based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); follows
[Semantic Versioning](https://semver.org/). Scope: the `/students/[studentId]`
Student 360 aggregator and the academic/finance figures it shares with the Student
Portal and Guardian Portal. See the [module document](student-360.md).

---

## [Unreleased]

Architectural-review hardening of the Student 360 aggregator (H1 security boundary,
H2 single-source academic average). On feature branch `feat/transcript-engine`;
validation at commit: `tsc` 0 · 228 module tests · `eslint` 0.

### Security (IDOR)
- Closed an IDOR on the student transcript page (`/students/[studentId]/transcript`): it now
  resolves scoped access via the shared `assertTeacherCanAccessStudent` guard **before**
  reading any transcript data, so a teacher-scoped caller holding `TRANSCRIPTS_VIEW` can no
  longer open the transcript of a student outside the classes they teach by changing the URL
  `studentId`. Out-of-scope (and cross-org / non-existent) access returns **404** — not 403 —
  to avoid id enumeration. Reuses the same contract as the Student 360 + timeline pages (no
  duplicated teacher-scope logic). Org isolation was already enforced by the org-scoped
  lookup; student-scoped users are already redirected to their own portal; the GUARDIAN role
  lacks `TRANSCRIPTS_VIEW`. `getStudentTranscript` is the only surface that reads this
  transcript — there is no export/PDF/API endpoint to guard separately.

### Security
- **Finance permission boundary at the aggregator.** Student 360 no longer queries,
  computes, or returns any finance figure to a viewer without finance permission — the
  gate is at the service boundary, not the UI (no finance query, no computation, no
  payload). Previously a viewer with `STUDENTS_READ` but no finance permission (e.g. the
  default TEACHER role) could see outstanding balance, wallet balance, the finance health
  axis and finance alerts.
- **Split finance into two independent capabilities** so the RBAC policy is explicit
  instead of "whoever sees invoices also sees the wallet": billing (invoices / payments /
  dívida) ← `INVOICES_VIEW`; wallet (saldo / movimentos / reembolsos) ← `WALLETS_VIEW`.
  Each half is a projection carrying only its own fields, so a billing-only viewer never
  receives a wallet figure in the payload (and vice-versa). The health finance axis is
  excluded and the weights renormalized when billing is not authorized; `overdue-balance`
  alerts require `INVOICES_VIEW` and `pending-refund` alerts require `WALLETS_VIEW`. Same
  boundary fixed in the Guardian Portal (previously masked at render but still fetched).

### Changed
- Standardized the displayed academic average across Student 360, Student Portal and
  Guardian Portal.
- The displayed "Média das Disciplinas" is now derived from the canonical
  StudentSubjectProgress final grades rather than legacy assessment-result samples.
- Standardized the displayed attendance percentage across Student 360, Student Portal
  and Guardian Portal.
- The displayed attendance percentage is now the canonical minute-weighted value from
  the persisted attendance period rollups (COMPLETED sessions only, justified/excused
  neutral), rather than a mean of per-subject percentages (Student 360) or a count-based
  ratio over raw records (portals).
- Consolidated student "at risk" classification into a single canonical risk engine
  (`buildStudentRiskSummary` → `StudentRiskSummary`). The Student 360 alerts panel, the
  overview risk chips and the health card's reasons/recommended action all now read this
  one classification instead of each re-inferring risk with its own conditions.
- The risk classification is permission-aware: the financial dimension is `null` when the
  viewer lacks finance permission, and the overall risk level is computed WITHOUT it — a
  viewer can never infer a hidden financial reason from the global level.
- The Health Score is now purely a 0–100 composite (score + per-axis breakdown); it no
  longer derives its own "reasons"/recommended action — those come from the canonical risk
  engine, keeping the two concepts distinct.
- Restructured the page into an executive hierarchy (H7): header → compact status band
  (Saúde · Risco · Estado Académico) → priority alerts (capped at 5) → operational cards
  (Académico · Assiduidade · Financeiro-if-authorized, each with metric + main problem +
  link) → recent activity → tabs. Each key metric now appears exactly once in the overview,
  and the Visão Geral tab no longer duplicates the domain tabs' tables/metrics (it holds
  identity, enrolment, portal account and guardians only).

- Separated the finance **summary** from the finance **history** (H3) — the last big
  structural change to the finance data flow. `core.finance` now carries only aggregate
  SUMMARIES (billing KPIs/counts + wallet KPIs), never the invoice/payment/receipt/refund
  lists. New `getStudentFinanceSummary` computes every figure with SQL `COUNT`/`SUM`/`MIN`/
  `MAX` (a grouped-by-status invoice pass + payment/refund/wallet/credit aggregates) instead
  of loading hundreds/thousands of rows and reducing them in JS. Consequences:
  - The **overview never loads the full statement** — only aggregates. The risk engine's
    finance dimension (overdue / pending-refund counts), the operational-card KPI and the
    finance-tab KPI cards all read the summary.
  - The **history stays paginated** (M2): the finance tab pages one bounded section at a
    time; the Student & Guardian portals fetch their bounded (unpaid-invoice / recent-
    payment) lists via the paginated reads and take their summary figures from the summary.
  - Aggregations are parallelizable with the academic/attendance summaries in the core
    `Promise.all`; the permission boundary (H1) is preserved (a half is queried only when
    its capability holds); no figure changed (semantics copied exactly from the old KPIs).
- Server-side paginated the Student 360 finance history (M2). The finance tab previously
  loaded the student's entire invoice/payment/receipt/refund history and paginated it
  client-side (`.slice()`); it now fetches one bounded page per section from the repository
  (`$transaction([findMany, count])`, stable `[date desc, id desc]` order, page size fixed
  server-side, soft-delete excluded, org+student scoped). The finance tab uses per-section
  subtabs (Faturas / Pagamentos / Recibos / Reembolsos) with independent URL-persisted
  pagination (`?tab=finance&financeSection=…&page=…`), each showing "A mostrar X–Y de N",
  and normalizes an out-of-range page to the last page. The page is fetched LAZILY (only
  when the finance tab is open) and remains permission-gated (billing sections ←
  INVOICES_VIEW, refunds ← WALLETS_VIEW; no query when unauthorized — H1 intact). The KPI
  summary is page-independent (not summed from the current page). Finance calculations,
  invoice states, balance and wallet rules are unchanged. *(The eager load of the finance
  statement into `core.finance` for the KPIs/risk/portals remains — tracked as H3.)*
- Completed the academic-domain separation (M1): the Student 360 aggregator no longer
  queries the prerequisites module's progression tables nor resolves progression state
  itself. The per-student level/course-progress reads moved to the prerequisites
  repositories (`findLevelProgressByStudent` / `findCourseProgressByStudent`); the
  current-level resolver (`resolveCurrentEnrollmentLevel`) is now owned by the academic
  summary contract, and the overview/portals read `academicSummary.currentLevel`. Pure
  refactor — no behaviour change; added architecture-guard tests. (The audit confirmed the
  academic *derivations* — label, tallies, risk, average — were already consolidated by
  H2/H6; M1 finished the residual reads/resolver.)

### Removed
- The 8-KPI summary-cards band and the large health card (`StudentSummaryCards`,
  `StudentHealthCard`) and the `buildSummaryCards` builder — superseded by the H7 status
  band + operational cards, which read the canonical summaries directly.
- Introduced a single canonical read model (`student-academic-summary.service`) computed
  once per request and consumed by every surface; it exposes both `subjectAverage`
  ("Média das Disciplinas", simple mean) and `courseFinalGrade` (the weighted course
  rollup already shown by the Academic Transcript), plus the subject tallies, current
  level and progression-status label — removing three duplicated academic-status-label
  derivations and four divergent average definitions.
- The Academic Transcript is intentionally **not** routed through the new function: it
  already reads the same canonical persisted source (`StudentCourseProgress.finalGrade`),
  so the value is consistent by origin. The invariant is the canonical origin of the
  value, not that every consumer traverses the exact same function.

### Fixed
- The Student 360 "Média" KPI on the Notas tab was computed over only the current
  paginated slice of assessment results (10 rows), so the headline average changed as the
  user paged. It now shows the canonical `subjectAverage` over the student's whole record.
- The attendance percentage diverged between surfaces for the same student (Student 360
  averaged per-subject percentages; the Student and Guardian portals used a count-based
  ratio over raw records in which justified absences diluted the denominator). All now
  read one canonical value; the health score's attendance axis, previously assumed a
  perfect 100 when a student had no attendance data, is now excluded (weight redistributed)
  when there are no scheduled sessions.

### Notes
- **Visible-number change (intentional):** because the Student Portal and Guardian Portal
  previously averaged the legacy `AssessmentResult` table (published-only, capped at 15
  rows) for grades and a count-based raw-record ratio for attendance, their displayed
  average and attendance percentages will change to the canonical figures. No API,
  schema, or migration change. Secretary/Admin already hold both finance permissions →
  finance experience unchanged; Teacher holds neither → zero finance queries.
- The canonical attendance percentage lives in the Attendance module
  (`getStudentAttendanceSummary`), reading the persisted period year-rollups; the rule
  itself is unchanged (it stays in the attendance calculation engine).

### Out of scope (flagged, not addressed here)
- The portals still read raw attendance records for two things the year-rollup cannot
  express: the **monthly attendance trend** (per-month grain) and the precise
  **unjustified-absence count** (the rollup's excused count overlaps absences/lateness).
  The headline attendance **percentage** is canonical everywhere; a precise unjustified
  count would need a dedicated persisted field.
- The **Teacher portal** derives per-class-group attendance from a third field
  (`StudentSubjectProgress.attendancePercentage`, populated only when attendance
  enforcement is on) — not yet migrated to the canonical summary.
- The **SQL-aggregate dashboards/watchlists** (executive dashboard, secretary portal,
  teacher portal, finance debt) still classify at-risk students with their own SQL and
  flat thresholds (e.g. attendance 75/85 against the legacy field) rather than the
  canonical per-student risk engine. The per-student surfaces (Student 360, alerts, health
  card) are fully consolidated; the dashboard convergence is tracked as a separate debt
  item — **M11 — Dashboard Risk Aggregation Convergence** in
  [the backlog](student-360-backlog.md) (preferred path: an event-updated persisted
  `StudentRiskProjection`; do NOT call the per-student engine per row).
