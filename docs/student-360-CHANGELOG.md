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

- Batched + deduplicated risk-projection recomputes (review finding **F-M4**). A bulk
  attendance / session recompute used to fan out to hundreds of **synchronous per-event** risk
  recomputes (and recomputed the *same* student several times when they appeared in several
  events). The risk handler now **schedules** instead of recomputing inline:
  - New coalescing `student-risk-recompute-scheduler` buffers requests keyed by
    `(organizationId, studentId)` within a short window, then flushes the **unique** students
    (grouped by org) through the batch API. Same-student events in a burst collapse to one
    recompute; distinct students are processed with bounded concurrency, not a per-event burst.
  - New canonical batch primitive `recalculateStudentRiskProjectionsBatch({ organizationId,
    studentIds, concurrency?, batchSize? })` — deduplicates, ignores an empty list, caps
    concurrency (`STUDENT_RISK_RECOMPUTE_CONCURRENCY`, default 5, clamp [1,20]) via a real
    pool (never an unbounded `Promise.all`), chunks (default 50, clamp [10,200]), isolates
    per-student failure, and returns counters `{ requested, unique, succeeded, failed,
    skipped }` (logged as metrics that prove the collapse, e.g. 250 events → 87 unique).
  - The `StudentRiskProjectionHandler` change is transparent — it still reacts to the same
    events post-commit and never fails the dispatch; correctness still rests on the idempotent
    recompute and the F-H3 reconcile, so the in-process dedupe is a pure cost/latency
    optimization (a flush lost to a suspended process is healed by the reconcile). The risk
    rules, the projection, coverage semantics, the event set and the post-commit guarantee are
    unchanged; event semantics are untouched (the attendance events still publish for their
    other subscribers).
- Excluded **soft-deleted students** from every risk-projection aggregate read (review finding
  **F-M2**). A `StudentRiskProjection` row is intentionally kept when its student is soft-deleted
  (audit / restore / reconcile), but it must not inflate KPIs or watchlists. All aggregate reads
  now go through one canonical base filter `buildVisibleRiskProjectionWhere(organizationId)` =
  `{ organizationId, student: { organizationId, deletedAt: null } }`, applied in the QUERY
  (before `orderBy`/`take`, never an in-memory post-filter that would shrink a page below its
  limit). Covered methods: `getStudentRiskLevelCounts`, `getStudentRiskDimensionAtRiskCounts`,
  `getStudentIdsWithDimensionRisk`, `findStudentRiskWatchlist` (both the finance-authorized
  `level` and the finance-blind `levelWithoutFinance` paths), and the version-stale reconcile
  helper. The relation filter also hardens tenant scoping (the student must be in the same org)
  and excludes orphan rows by construction. Watchlist ordering gained a deterministic tertiary
  key (`studentId asc`). Coverage semantics, the reconcile pipeline, the risk engine and the
  persisted projection are unchanged — a soft-deleted student simply stops appearing in
  aggregates (and reappears only once restored AND re-made eligible, via the fail-closed gate /
  reconcile). No figure changes for orgs without soft-deleted students.
- Unified the financial **"overdue" semantics** (review finding **F-M1**). Overdue is now a
  single canonical **financial fact**, not the materialized status: an invoice is overdue when
  it is **open** (`PENDING`/`PARTIALLY_PAID`/`OVERDUE`) **and** has a **balance > 0** **and**
  its `dueDate` is before the org's day **boundary** (start of today in the org timezone, minus
  the configured grace days — the SAME window the daily-billing job uses).
  - New single specification `student-finance-semantics` (`OPEN_INVOICE_STATUSES`,
    `resolveOverdueBoundary`, `resolveInvoiceTimezone`, `buildOutstandingInvoiceWhere`,
    `buildOverdueInvoiceWhere`). `getStudentFinanceSummary` computes `overdueAmount` /
    `overdueInvoiceCount` (and a new `oldestOverdueDate`, plus `asOf`) from this fact aggregate
    instead of counting the `OVERDUE` status; the daily-billing job delegates its
    boundary/timezone helpers to the same module (single source).
  - Because the risk engine consumes the summary, **Student 360, the risk projection and the
    dashboards now converge on one overdue definition** — and it is correct **even before the
    daily job flips statuses** or when automatic overdue processing is off (the review's sharp
    gap). A partly-paid invoice contributes only its **remaining balance**; an invoice paid to
    a zero balance is **not** overdue even if its status is still `OVERDUE`; `CANCELLED` and
    zero-balance invoices are excluded; an invoice due **today** is not yet overdue.
  - Unallocated wallet balance/credit does **not** reduce overdue (only credit already
    *applied* to an invoice lowers its `balanceAmount`); the wallet balance stays a separate
    figure the risk engine may recommend using, never a silent debt write-off.
  - **Visible-number change (intentional):** overdue figures now reflect the financial fact
    (past-due-by-date), so they can differ from the old status-only counts during the grace/
    pre-job window. No schema change.
- Made the backfill/reconcile **resumable and cursor-based** (review finding **F-H4**) — safe
  for very large tenants. The blocking "load every eligible student → process → lose progress
  on interrupt" sweep is replaced by a run pipeline: **cursor page → recompute batch →
  checkpoint → next page → final coverage verification**.
  - **`StudentRiskProjectionReconcileRun`** model (+ additive migration) — one row per logical
    run, holding `mode` / `sourceVersion` / `status`
    (`PENDING|RUNNING|PAUSED|COMPLETED|COMPLETED_WITH_ERRORS|FAILED|CANCELLED`), a
    `cursorStudentId`, per-run counters, and a time-boxed lease (`leaseOwner`/`leaseExpiresAt`).
  - **Cursor pagination** (`id ASC`, `id > cursor` — never `skip`, which degrades with offset);
    a page never crosses organizations. The sweep walks everything ordered after the cursor
    (so students created mid-run with a later id are included), and the **final completeness
    verification** catches anything left (→ coverage INCOMPLETE, healed by a later `missing`
    run).
  - **Checkpoint after each batch** (advance cursor + increment counters + renew lease). The
    cursor moves only at checkpoint, so a process that dies mid-batch simply **repeats that
    batch on resume** (recalc is idempotent) with no double-counting.
  - **Lease / concurrency:** advancing a run requires an atomic conditional acquire (a
    `PENDING/PAUSED/FAILED` run, or a `RUNNING` run whose lease has expired). If it matches
    nothing, another instance holds it — the caller does not process it. This closes the
    multi-instance gap noted in F-H3 without a separate lock table; an abandoned `RUNNING` run
    is recovered once its lease expires.
  - **Per-invocation budget** (`maxBatches` / `maxDurationMs`) → the run **PAUSES** with its
    checkpoint saved and resumes next time; the cron/CLI report `completed` / `paused` /
    `failed` distinctly. Batch size is configurable (`STUDENT_RISK_RECONCILE_BATCH_SIZE`),
    clamped to `[10, 500]` (default 100).
  - **Coverage unchanged (F-H1):** only a **completed FULL ("all")** run whose verification
    confirms 0 uncovered + 0 failures marks READY; a partial completion marks INCOMPLETE; the
    `missing` / `version-stale` modes never touch coverage. A run's per-student failure never
    aborts the sweep (recorded as `failedCount`; details go to logs, never PII on the run).
  - **Cron** now advances the pipeline within a budget (`advanceReconcileRunsWithinBudget`):
    it **resumes incomplete runs first** (recovering expired leases), then starts new `all`
    runs for active orgs without a recent run — so the same pipeline serves the initial
    backfill, the daily reconcile, interruption recovery and version upgrades.
  - **CLI**: `--all` / `--missing` / `--version-stale`, `--organization <id>`, `--batch-size`,
    `--max-batches`, `--resume <runId>` (continue a run), `--status --resume <id>` (report
    without processing); exit 0 on completed/paused, 1 on failed / completed-with-errors /
    invalid args.
  - Purely operational: the risk engine, thresholds, `StudentRiskProjection`, the F-H1
    coverage semantics, the F-H2 event handler and the dashboard consumers are **unchanged**.
- Added the periodic reconciliation + temporal-risk coverage (review finding **F-H3**) — the
  safety net for what direct events (F-H2) can't guarantee: time-driven drift, lost/FAILED
  events (the bus has no outbox/retry), rules-version drift, policy fan-out and partially-
  covered orgs.
  - **Scheduled reconcile job** `runReconcileRiskProjectionsJob` + internal cron route
    `POST /api/internal/jobs/reconcile-risk-projections` (same `x-internal-job-secret`
    fail-closed contract as the billing job). It iterates organizations **sequentially**
    (bounded load; the per-org reconcile pages internally, never loading all students),
    isolates per-org failure (one org failing never aborts the rest), runs the **full**
    reconcile per org (the only mode that updates coverage), guards against overlapping runs
    on the same instance (idempotency covers the multi-instance case), and writes an audit
    record. Intended cadence: daily.
  - **Explicit reconcile modes** (replacing the ambiguous `--stale`): `all` (every eligible
    student; owns the coverage rollout state), `missing` (only students with no projection
    row) and `version-stale` (only rows on an older rules version — *not* factual-drift
    detection). The backfill CLI now takes `--all` (default) / `--missing` / `--version-stale`
    (with `--stale` kept as an alias) and exits non-zero on partial failure.
  - **Temporal financial risk (`INVOICE_OVERDUE`):** the daily billing job now emits
    `INVOICE_OVERDUE` **per affected student** (the delta that newly crossed its dueDate this
    run — distinct, org-scoped), and the risk handler subscribes to it. So a student going
    overdue by the passage of time refreshes promptly instead of waiting for the reconcile;
    the reconcile remains the backstop. Independent of `notifyOnOverdue` (that flag governs
    notifications, not risk).
  - **Covered by the daily reconcile (documented, not per-event):** document expiry, academic/
    attendance **policy fan-out** (a min-grade / min-attendance change re-classifies whole
    cohorts — handled by the batch sweep, never a synchronous loop in the mutation command),
    lost/FAILED events, missing rows and version drift. Individual events never change the
    coverage rollout state (F-H1 preserved); only the full sweep does.
- Closed the risk-projection event-coverage gap (review finding **F-H2**). Previously only
  two events (`attendance.summary_recalculated`, `payment.confirmed`) kept the projection
  fresh, so most direct risk mutations relied on the reconcile sweep. The
  `StudentRiskProjectionHandler` now subscribes to a **single centralized contract**
  (`STUDENT_RISK_RECALCULATION_EVENTS`) covering every direct mutation with a known student:
  academic (`student_subject.passed/failed`), attendance (summary + justification
  approved/rejected — the justification events are the only trigger when the % is unchanged),
  financial (payment confirmed/cancelled, refund requested/rejected/completed),
  enrolment/progression (`enrollment.created/activated/cancelled/completed`,
  `student_course.completed/reopened`, `student_level_progression.changed`), documents
  (`student_document.status_changed`) and per-student prerequisite waivers
  (`student_prerequisite_waiver.changed`). All are emitted **post-commit** (so a failed
  recompute can never roll back the mutation — the handler is best-effort and never throws),
  and identity comes from a payload `studentId` (no extra query).
  - **New events emitted at their canonical mutation point:** `STUDENT_LEVEL_PROGRESSION_CHANGED`
    (both the recompute and the manual-approval paths, only on a real status change),
    `ENROLLMENT_CANCELLED`/`ENROLLMENT_COMPLETED` (were declared but never published),
    `STUDENT_DOCUMENT_STATUS_CHANGED` (submit/verify/remove), `STUDENT_PREREQUISITE_WAIVER_CHANGED`
    (grant/revoke, with `studentId` derived from the validated enrolment). `studentId` was
    added to the existing `REFUND_REJECTED`/`REFUND_COMPLETED` payloads.
  - **Deduplication:** only the final canonical fact of an operation is subscribed (e.g. the
    attendance summary event, not its BELOW_REQUIRED/RECOVERED transitions); where two
    legitimate finals co-fire (subject-passed + course-completed, or justification + summary),
    the extra recompute is an idempotent no-op (the classification write is skipped).
  - **Explicitly deferred to F-H3:** temporal `INVOICE_OVERDUE` (dueDate + daily job — the
    biggest financial trigger), document expiry, policy fan-out (min grade / min attendance %
    affecting whole cohorts), and lost/failed-event recovery (no outbox/retry) — all remain the
    responsibility of the reconciliation sweep. Individual handler events never change the
    `StudentRiskProjectionCoverage` rollout state (F-H1 preserved).
- Hardened the dashboard rollout gate (review finding **F-H1**). The fragile
  `count(organizationId) > 0` "coverage" check — which flipped a whole org onto the
  projection the instant a single event-driven row was written, silently undercounting
  everyone else — was replaced by a **completeness** gate. A new
  `StudentRiskProjectionCoverage` row records the per-org rollout state
  (`NOT_STARTED / RUNNING / INCOMPLETE / READY / STALE / FAILED`), and
  `getStudentRiskProjectionCoverage()` returns `ready: true` only when the org was marked
  READY by a **full** backfill/reconcile at the current rules version **and** a live
  re-check confirms zero eligible students lack a current-version projection (fail-closed —
  a student created/soft-deleted/version-bumped since the backfill immediately drops the org
  back to the legacy path). Only the full backfill/reconcile may mark READY; the event
  handler never touches rollout state, so an incidental projection write can no longer
  activate canonical mode (deploy-ordering hazard closed). Completeness is measured over
  *students* (a `students … NOT EXISTS current projection` relation count), so orphan/soft-
  deleted projection rows can never compensate a missing student. A single `eligible student`
  predicate (`buildRiskProjectionEligibleStudentWhere` = non-deleted students of the org) is
  now shared by the backfill scope, the expected count, and the gate so they cannot diverge.
  The four dashboard consumers read the new gate. (Migration
  `20260721140000_add_student_risk_projection_coverage`, additive/forward-only.)
- Began converging the dashboards/watchlists onto the canonical risk classification (M11).
  A persisted `StudentRiskProjection` (M11.1) now holds the H6 engine's per-student output
  (`level` + finance-excluded `levelWithoutFinance`, per-dimension levels, ordered reasons,
  `sourceVersion`), written by `recalculateStudentRiskProjection` (M11.2) — the SAME engine
  Student 360 uses, run twice (with/without finance), never re-implemented in SQL. In M11.3
  the SQL-aggregate consumers read the projection instead of their own flat thresholds, with
  a **read-through fallback**: while an org has no projection rows yet (pre-backfill) they
  fall back to the legacy classification, so no dashboard shows a false "zero at risk":
  - Executive dashboard: `studentsAtRisk` and `studentsLowAttendance` now come from the
    projection (the canonical decision, not a flat 75%); the operational drill-down counts
    (blocked / recovery / eligible / overdue / class-group attendance) are unchanged.
  - Students module dashboard counts (`countStudentsAtAcademicRisk`,
    `countStudentsWithLowAttendance`) and the grades `atRiskStudentCount` now read the
    projection's academic/attendance dimensions.
  - Teacher portal risk list: the attendance risk decision now uses the canonical per-subject
    minimum (the SAME answer as Student 360), collapsing the old flat `LOW=75`/`TREND=85`
    split into one at-risk determination; the other teacher-scoped signals (blocked /
    recovery / failed / missing-assessments) are unchanged.
  - Secretary and finance-debt watchlists were reviewed and left as-is: they are operational
    queues (overdue / balance by date), consistent by origin after H3 — they carry no
    divergent 75/85 risk threshold to converge.

  **Visible-number change (intentional, once an org is backfilled):** the executive
  dashboard's "at risk" count becomes the canonical (broader) classification rather than
  blocked∪recovery; "low attendance" and the teacher attendance risk use the per-subject
  minimum instead of a flat percentage.
- Wired the projection's upkeep (M11.4): a `db:backfill-student-risk-projection` runner
  (idempotent, batched, per-org, `--stale` for a rules-version bump) plus
  `reconcileStudentRiskProjectionsForOrg` recompute every student via the same engine, and a
  `StudentRiskProjectionHandler` on the domain-event bus recomputes a student's projection
  synchronously after the facts that carry a studentId commit (attendance summary
  recalculated, payment confirmed). Academic/progression/document changes are covered by the
  reconciliation pass until their events carry a studentId. Run the backfill once per org
  after the migration and BEFORE releasing the dashboard flip so no dashboard shows a false
  zero. **Deferred to the deploy:** removing the legacy SQL classifications (and the flat
  75/85 fallbacks) and adding the anti-duplication architecture tests — gated on a real
  backfill + parity comparison, so the read-through fallback stays until then.
- Removed the eligibility N+1 in the Progress tab (H4). Evaluating a whole level used to
  run one full query set **per subject** (`evaluateEligibilityForAllSubjects` looped
  `evaluateSubjectEligibility`, which re-loaded the enrollment and the student's entire
  subject progress for every subject — ~5 queries × N). It is now a two-step design:
  - a **batch loader** `loadEligibilityEvaluationContext({organizationId, studentId,
    enrollmentId, courseLevelId})` that fetches everything the decision needs in a
    **constant** number of queries regardless of subject count (enrollment tenant-gate →
    ACTIVE level subjects + the student's org-wide progress + the enrollment's target-subject
    status + the prerequisite groups/items for all targets in one `IN (…)` + the enrollment's
    active waivers), and
  - a **pure** `evaluateEligibilityForAllSubjects(context)` that applies the existing
    `decideSubjectEligibility` rules per subject over in-memory Maps — no IO, no `await`.

  The student's progress is loaded **once, scoped by student** (not by level), so a
  prerequisite that lives **outside the current level** (a transitive dependency) is already
  present in the context and evaluated correctly. Outputs are identical to the per-subject
  path — the academic rules (ALL/ANY, MUST_PASS/MUST_COMPLETE/MINIMUM_GRADE, waivers,
  ALREADY_COMPLETED, BLOCKED, result order) are unchanged; this is a data-access optimization,
  not an engine revision. Tenant isolation is preserved (the enrollment is validated against
  the org + soft-delete, and progress is scoped by the enrollment's own student — a caller
  studentId hint is not trusted). The single-subject `evaluateSubjectEligibility` IO helper is
  retained for its own callers; the batch path no longer uses it.
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
