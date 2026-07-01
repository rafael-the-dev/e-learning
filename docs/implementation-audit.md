# Implementation Audit — Academic Platform

**Scope:** 36 feature areas · **Method:** static (read-only) code review · **Date:** 2026-07-01
**Stack:** Next.js 16 (App Router) · React 19 · Prisma 7 · SQL Server · Auth.js + RBAC

> This is an assessment only. No source code, migration, or config was modified in producing it.
> Status is `YES` only where code exists; `PARTIAL` where a core piece is stubbed or a defining
> capability is missing (explained inline). Three findings assert concrete defects — the
> **class-group capacity-count leak**, the **schedule conflict-detection gap**, and the
> **dual grade-model inconsistency** — and should be re-verified against current source before
> remediation. "Documented stubs" (financial clearance / `PENDING_PAYMENT`) are intentional,
> code-commented placeholders, not silent omissions.

---

## 1 · Executive Summary

Every one of the 36 areas has real code behind it, following a consistent layered architecture
(`schemas → repositories → commands/services → actions → UI`) with the Command pattern
(`validate → authorize → execute`) and org-scoped repositories.

- **Strongest:** tenant isolation, RBAC, audit-write path, the financial subsystem
  (invoices/allocations/wallet/receipts — transactional, integrity-checked), and the progression
  engines (pure decision helpers + real test suites).
- **Weakest:** **test coverage of the academic core** (courses/levels/subjects/lessons, scheduling,
  and grade calculation are largely untested) and a small cluster of **correctness/data-integrity
  gaps** in class-group capacity tracking, schedule conflict detection, and the assessment/grade
  model.

| Metric | Count |
|---|---|
| Fully implemented (YES) | 34 |
| Partial (Schedules, Assessment Policies) | 2 |
| Not implemented (NO) | 0 |
| High-risk areas | 5 |
| Medium-risk areas | 15 |
| Low-risk areas | 16 |

---

## 2 · Implementation Matrix

| # | Item | Implemented | Risk | Tests | Domain |
|---|------|-------------|------|-------|--------|
| 1 | Organizations | YES | LOW | Partial | Foundation |
| 2 | Users Management | YES | LOW | Yes | Foundation |
| 3 | Students | YES | LOW | Yes | Academic structure |
| 4 | Teachers | YES | LOW | Yes | Academic structure |
| 5 | Courses | YES | MEDIUM | None | Academic structure |
| 6 | Course Categories | YES | MEDIUM | None | Academic structure |
| 7 | Course Levels | YES | MEDIUM | None | Academic structure |
| 8 | Subjects | YES | MEDIUM | None | Academic structure |
| 9 | LevelSubject | YES | MEDIUM | None | Academic structure |
| 10 | Lessons | YES | MEDIUM | None | Learning & scheduling |
| 11 | SubjectLesson | YES | MEDIUM | None | Learning & scheduling |
| 12 | Class Groups | YES | **HIGH** | None | Learning & scheduling |
| 13 | Schedules | **PARTIAL** | **HIGH** | None | Learning & scheduling |
| 14 | Enrollments | YES | **HIGH** | None | Learning & scheduling |
| 15 | Billing Policies | YES | MEDIUM | None | Finance |
| 16 | Fee Definitions | YES | MEDIUM | None | Finance |
| 17 | Invoices | YES | LOW | Integrity | Finance |
| 18 | Invoice Items | YES | LOW | Indirect | Finance |
| 19 | Payment Splits | YES | MEDIUM | Indirect | Finance |
| 20 | Payment Allocations | YES | LOW | Integrity | Finance |
| 21 | Student Wallet | YES | LOW | Yes | Finance |
| 22 | Receipts | YES | LOW | Yes | Finance |
| 23 | Grade Engine | YES | MEDIUM | None | Assessment & grades |
| 24 | Assessment Policies | **PARTIAL** | **HIGH** | None | Assessment & grades |
| 25 | Assessment Events | YES | MEDIUM | None | Assessment & grades |
| 26 | StudentAssessmentResult | YES | **HIGH** | None | Assessment & grades |
| 27 | StudentSubjectProgress | YES | MEDIUM | None | Assessment & grades |
| 28 | StudentLevelProgress | YES | LOW | Yes | Progression |
| 29 | StudentCourseProgress | YES | LOW | Yes | Progression |
| 30 | SubjectEligibilityEngine | YES | MEDIUM | Yes | Progression |
| 31 | LevelProgressionEngine | YES | LOW | Yes | Progression |
| 32 | Manual Level Progression Approval | YES | LOW | Yes | Progression |
| 33 | CourseCompletionEngine | YES | LOW | Yes | Progression |
| 34 | RBAC | YES | LOW | Yes | Foundation |
| 35 | Audit Logs | YES | MEDIUM | Indirect | Foundation |
| 36 | Tenant Isolation | YES | LOW | Yes | Foundation |

---

## 3 · Critical Missing Items

Correctness / data-integrity gaps inside otherwise-implemented features. None are "feature absent".

1. **Class-group capacity count is never decremented — HIGH.** `currentCount` is incremented on
   enrollment creation and validated against `capacity`, but suspend/cancel/delete enrollment
   commands do not decrement it. After the first cancellation the class appears permanently fuller
   than it is, eventually blocking legitimate re-enrollment. Affects #12 and #14. Fix in
   `suspend/cancel/delete-enrollment.command.ts` + backfill migration. *Verify against source first.*
2. **Schedules have no conflict detection — HIGH.** Overlapping slots can be assigned to the same
   class group; the same teacher can be booked into conflicting slots; slots are not integrated with
   classroom availability (`ClassroomBooking` is checked separately). Drives the PARTIAL rating (#13).
3. **Dual grade model without reconciliation — HIGH.** `AssessmentResult` and
   `StudentAssessmentResult` coexist with different status enums; `invalidate-assessment-result.command`
   touches only `AssessmentResult`, so a GRADED student result can point at an INVALIDATED source (#26).
4. **Single grade entry does not recalculate subject progress — MED→HIGH.** Only bulk grading triggers
   `RecalculateStudentSubjectProgress`; a continuous-assessment grade created/updated one at a time
   leaves `StudentSubjectProgress` stale until a separate command runs (#26/#27).
5. **Assessment-policy weight validation deferred to activation — MEDIUM.** Weighted-average policies
   only enforce the 100 % component-sum at activation, and the stored `roundingMethod` is not read at
   calculation time (passed as a parameter) — a config-to-execution gap (#24).
6. **No auto-activation / expiry on enrollments — MEDIUM.** `PENDING_PAYMENT → ACTIVE` requires a manual
   command (no transition on full payment), and `expectedEndDate` is metadata only — it does not gate
   portal access after the enrollment ends (#14).

---

## 4 · Business Logic Gaps

Intentionally deferred or not-yet-built logic, distinct from the defects above.

- **Financial clearance is an explicit, documented stub.** Both `LevelProgressionEngine` (#31) and
  `SubjectEligibilityEngine` (#30) carry code comments noting `requireFinancialClearance` /
  `FinancialEligibilityService` is not implemented; `PENDING_PAYMENT` is defined but never produced.
- **Manual payment-allocation override is stubbed.** `allocate-payment.command.ts` throws
  `BusinessRuleError`; automatic priority-based allocation works, manual re-targeting does not (#19/#20).
- **Attendance gating is dead code.** The grade engine implements a `minimumAttendancePercentage` gate,
  but `attendancePercentage` is always passed as `null` — no attendance-to-progress plumbing (#23/#27).
- **No cycle detection in lesson/prerequisite chains.** `SubjectLesson.unlockAfterLessonId` (#11) and
  `LevelSubject` prerequisite items (#9) allow self-referential chains with no loop guard.
- **Lifecycle constraint checks missing on catalog deletes.** Courses/Categories/Subjects/Levels
  (#5–#8) can be archived/deleted without checking dependent enrollments/references. `CourseLevel` also
  uses `isActive` for soft-delete instead of the `deletedAt` convention used everywhere else.
- **Audit logs: no retention policy or confirmed read surface.** Writes are comprehensive (30+ commands)
  but no retention/archival exists and a general audit-log viewer was not confirmed (#35).

---

## 5 · Test Coverage Gaps

Coverage is bimodal.

**Well covered:** progression engines (`subject-eligibility.engine.test.ts` 19,
`level-progression.engine.test.ts` 23, `course-completion.engine.test.ts` 7); manual approval
(`review-progression-request.service.test.ts` 6, `progression-request-workflow.actions.test.ts` 7);
auth/scoping (teacher/student/guardian scope + portal-permission); Users command tests; tenant-isolation
repository + import integration; wallet concurrency; finance integrity + receipt cancellation.

**No dedicated tests found (highest-value first):**
- Grade Engine calculation logic (weighted/simple avg, rounding modes, required-component blocking) ← top gap
- StudentAssessmentResult create/update + change-log + progress cascade
- StudentSubjectProgress derivation & cascade
- Assessment Policies activation weight-validation
- Assessment Events status transitions & publication gating
- Courses, Categories, Course Levels, Subjects, LevelSubject commands
- Lessons, SubjectLesson, Class Groups, Schedules, Enrollments commands
- Billing Policies & Fee Definitions commands
- Organization CRUD commands (only role tests exist)

---

## 6 · Recommended Implementation Order

Sequenced by risk × blast-radius. Verify each defect claim against current source first.

1. **Fix class-group capacity leak (HIGH).** Decrement `currentCount` on suspend/cancel/delete enrollment;
   backfill migration for inflated counts; enroll→cancel→re-enroll integration test.
2. **Add schedule conflict detection (HIGH).** Overlap check within a class group, teacher-availability
   check across assignments, integration with classroom bookings; reject overlapping slot assignment.
3. **Reconcile the dual grade model (HIGH).** Define ownership between `AssessmentResult` (participation)
   and `StudentAssessmentResult` (grade); make invalidation cascade correctly; document boundaries.
4. **Auto-cascade subject progress on single grade entry (HIGH→MED).** Trigger
   `RecalculateStudentSubjectProgress` from create/update grade commands, or document the manual contract.
5. **Grade-engine + assessment test suite (MEDIUM).** Unit-test weighted/simple average, all rounding
   modes, required-component blocking, thresholds; test policy activation weight-validation and
   assessment status transitions/publication gating.
6. **Enrollment payment automation & expiry (MEDIUM).** Auto-transition PENDING_PAYMENT → ACTIVE on full
   payment (domain event); enforce `expectedEndDate` in portal access guards.
7. **Assessment-policy config integrity (MEDIUM).** Read `roundingMethod` from the policy at calculation
   time; add weight validation earlier (or document activation as the single checkpoint).
8. **Cycle detection for unlock/prerequisite chains (MEDIUM).** Graph-traversal guard on
   `SubjectLesson.unlockAfterLessonId` and LevelSubject prerequisite items.
9. **Catalog command tests + constraint guards (MEDIUM).** Cover courses/categories/levels/subjects/
   levelsubject and billing config; block deletes with dependent references; standardize CourseLevel
   soft-delete to `deletedAt`.
10. **Audit-log retention + review, and finance stubs (LOW).** Add retention/archival and confirm/extend
    an audit-log viewer; implement manual payment-allocation override; wire financial clearance when the
    finance service lands.

---

## 7 · Per-Item Detail

Files are repo-relative. Each item: business logic implemented → missing → tests → next action.

### Foundation

#### 1. Organizations — YES · LOW
**Files:** `src/modules/organizations/{repositories,services,commands,schemas}/*`; prisma `Organization`, `OrganizationSettings`
**Implemented:** status TRIAL/ACTIVE/SUSPENDED/CANCELLED; plans FREE/STARTER/PROFESSIONAL/ENTERPRISE; soft-delete `deletedAt`; 1:1 OrganizationSettings (currency, tax, billing defaults); every query org-scoped; commands validate→authorize→execute with old/new-value audit; suspend enforces authorization.
**Missing:** automatic trial-to-paid conversion; payment-provider plan enforcement.
**Tests:** role-command tests touch org scoping; no dedicated org-CRUD command tests.
**Next:** add org command unit tests; trial-conversion job if planned.

#### 2. Users Management — YES · LOW
**Files:** `src/modules/users/{repositories,services,commands}/*`; prisma `User`, `UserOrganization`, `UserRole`
**Implemented:** global user + UserOrganization (isOwner, joinedAt); UserRole (assignedAt/By); all queries filter by org membership; guards block SUPER_ADMIN assignment, last-ORG_ADMIN demotion, cross-tenant custom roles; multiple roles/org; soft-delete.
**Missing:** explicit invite/pre-acceptance flow; password reset/email verification (may be in auth layer).
**Tests:** assign/remove/create org-user command tests (SUPER_ADMIN block, archived-role block, last-admin block, cross-tenant rejection).
**Next:** last-owner edge cases & concurrent role removal; invite acceptance if not elsewhere.

#### 34. RBAC — YES · LOW
**Files:** `src/server/auth/{permissions,rbac,context,teacher-scope,student-scope,guardian-scope}.ts`; prisma `Role`, `Permission`, `RolePermission`, `UserRole`
**Implemented:** ~475 permissions ("module.action"); system roles + DB-backed custom roles; `getUserPermissions` → `createAbility` (can/canAll/canAny); pages guard via `requirePermissionOrRedirect`; role-based data scoping resolved server-side from `userId`; guardian per-link visibility flags; active-org cookie validated vs membership with fallback.
**Missing:** no field-level/column masking (row-level only); no time-bound grants.
**Tests:** teacher/student/guardian scope, portal-permission, role-assignment tests.
**Next:** org-switch isolation integration test (org-A perms must not read org-B).

#### 35. Audit Logs — YES · MEDIUM
**Files:** `src/modules/audit-logs/services/audit.service.ts`; prisma `AuditLog`; used across 30+ commands
**Implemented:** captures org, actor, entity, entityId, action, old/new JSON, ip, userAgent, createdAt; `auditService.log()` after successful mutation across every major module; org-scoped; separate financial-audit service.
**Missing:** no retention/archival (unbounded growth); general read/query UI not confirmed (permission exists); no external immutable sink.
**Tests:** verified indirectly in command tests; dedicated financial-audit service test.
**Next:** retention policy + confirm/extend review UI; consider periodic export to immutable store.

#### 36. Tenant Isolation — YES · LOW
**Files:** all `src/modules/*/repositories/*`; `src/server/auth/context.ts` + `*-scope.ts`
**Implemented:** every repository query prefixes WHERE with context `organizationId`; org always derived server-side, never from client; `setActiveOrg` validates membership before cookie; invalid cookie → fallback; row-level scoping via discriminated `DataAccessScope`; composite `(organizationId, …)` indexes; `deletedAt: null` filters prevent cross-tenant resurrection.
**Missing:** no SQL-Server row-level security (all scoping ORM-layer); no per-tenant DB/schema separation.
**Tests:** repository scoping, scope tests, import tenant-isolation integration, cross-tenant role rejection.
**Next:** forged-org-context integration test; consider RLS as defense-in-depth.

### Academic Structure

#### 3. Students — YES · LOW
**Files:** `src/modules/students/{schemas,repositories,commands,services,actions}/*`; `student-360/`; `import/`
**Implemented:** lifecycle PENDING→ACTIVE→SUSPENDED/COMPLETED/DROPPED; soft-delete; org-scoped; ID-number uniqueness/org; optional branch + user link (portal); search (name/email/phone/idNumber); pagination; teacher-scoped list; dashboard aggregates; audit; CSV/XLSX import with tenant isolation.
**Missing:** auto-generated student code (field exists, manual only); batch suspension; StudentDocument mutation commands.
**Tests:** repository, user-provisioning, portal-account status/actions, import tenant-isolation integration.
**Next:** auto-generate codes; add StudentDocument commands.

#### 4. Teachers — YES · LOW
**Files:** `src/modules/teachers/{schemas,repositories,commands,actions}/*`; `teacher-360/`; `import/`
**Implemented:** lifecycle ACTIVE→SUSPENDED/INACTIVE; soft-delete; org-scoped; ID + license uniqueness/org; subject assignment prevents duplicates & blocks assigning to suspended/inactive teachers; removal validates; hire date/specialization/license; search; pagination; audit.
**Missing:** auto-generated teacher code; batch subject assignment; TeacherDocument mutation commands.
**Tests:** repository, service, import tenant-isolation integration.
**Next:** auto-generate codes; add TeacherDocument commands.

#### 5. Courses — YES · MEDIUM
**Files:** `src/modules/courses/{schemas,repositories,commands,services,actions}/* (course.*)`
**Implemented:** lifecycle DRAFT→ACTIVE→INACTIVE→ARCHIVED; soft-delete; org-scoped; code + name uniqueness/org; optional validated category; price Decimal(10,2); total hours; CourseWithCounts projection; search; pagination; audit.
**Missing:** no guard preventing delete/archive with active enrollments; no price-change audit trail.
**Tests:** NONE FOUND for course commands.
**Next:** add command tests; block deletion with active enrollments.

#### 6. Course Categories — YES · MEDIUM
**Files:** `src/modules/courses/{schemas,repositories,commands,actions}/* (category.*)`
**Implemented:** lifecycle ACTIVE→INACTIVE→ARCHIVED; soft-delete; org-scoped; name uniqueness/org; `countCoursesUsingCategory()`; archive helper; audit.
**Missing:** no delete protection when courses still reference the category.
**Tests:** NONE FOUND.
**Next:** add tests; block/relink on delete when referenced.

#### 7. Course Levels — YES · MEDIUM
**Files:** `src/modules/courses/{schemas,repositories,commands,actions}/* (level.*, reorder-levels)`
**Implemented:** auto-increment `order`; reorder validates all IDs belong to course & no duplicates; name unique/course; total hours/duration; lifecycle ACTIVE/INACTIVE/ARCHIVED; audit.
**Missing:** soft-delete uses `isActive` not `deletedAt` (inconsistent with all other entities); no enrollment-count guard on delete.
**Tests:** NONE FOUND.
**Next:** standardize to `deletedAt`; add tests + enrollment guards.

#### 8. Subjects — YES · MEDIUM
**Files:** `src/modules/courses/{schemas,repositories,commands,actions}/* (subject.*)`
**Implemented:** org-level subject (not course-scoped); code uniqueness/org; lifecycle ACTIVE/INACTIVE/ARCHIVED; soft-delete; assignment-count queries (teacher + level); search; audit.
**Missing:** no warning/guard when deleting a subject assigned to levels/teachers; no bulk updates.
**Tests:** NONE FOUND.
**Next:** add tests; add reference guards on delete/archive.

#### 9. LevelSubject — YES · MEDIUM
**Files:** `src/modules/courses/{schemas,repositories,commands,actions}/* (level-subject.*, reorder-level-subjects)`
**Implemented:** unique subject per level; auto-increment order + order-taken guard; soft-delete; org-scoped via course; workload rule theory+practical ≤ total (schema + command); reorder validates completeness & membership; academic fields (workload/theory/practical hours, minimum grade/attendance, maxAbsences, credits, isRequired, retake/compensation/certificate flags).
**Missing:** no circular-prerequisite detection at assignment; workload rule not re-checked on partial patch; no per-level credits rollup.
**Tests:** NONE FOUND (prerequisite *eligibility* engine is tested separately — see #30).
**Next:** add tests; cycle detection; credits rollup validation.

### Learning & Scheduling

#### 10. Lessons — YES · MEDIUM
**Files:** `src/modules/lessons/{commands,repositories}/*`; prisma `Lesson`, `LessonAttachment`, `StudentLessonProgress`
**Implemented:** lifecycle DRAFT→PUBLISHED→ARCHIVED with publish authorization; slug unique/org; attachments (many types); video-provider abstraction; lesson types; progress via watch-percentage thresholds; audit + LESSON_PUBLISHED event.
**Missing:** no duplication/template, versioning, or review-before-publish workflow.
**Tests:** NONE FOUND.
**Next:** lifecycle integration tests (create→assign→publish→progress).

#### 11. SubjectLesson — YES · MEDIUM
**Files:** `src/modules/lessons/{commands,repositories}/* (assign/reorder/remove subject-lesson)`
**Implemented:** assignment with per-subject order; unique (subject, lesson) + unique (subject, order); soft-delete; unlock sequencing via `unlockAfterLessonId`; isRequired; minWatchPercentage; status ACTIVE/INACTIVE/ARCHIVED.
**Missing:** no circular-unlock (A→B→C→A) detection — risk of permanently-locked lessons; no position rebalancing on mid-sequence delete; no cross-subject prerequisites.
**Tests:** NONE FOUND.
**Next:** cycle detection + reorder/unlock tests.

#### 12. Class Groups — YES · HIGH
**Files:** `src/modules/class-groups/{commands,repositories,services}/*`; prisma `ClassGroup`
**Implemented:** lifecycle FORMING→ACTIVE→COMPLETED/CANCELLED; capacity default 30, enforced on enrollment; code unique/org; links course/level/branch/teacher/year/term; date-range validation; watchlist & metrics; audit; `currentCount` incremented on enrollment assignment.
**Missing:** **`currentCount` never decremented on cancel/suspend/drop → capacity leak**; no capacity-reduction validation; no student transfer; no auto FORMING→ACTIVE.
**Tests:** NONE FOUND.
**Next:** add decrement on enrollment exit + backfill migration + enroll/cancel/re-enroll test. *Verify claim first.*

#### 13. Schedules — PARTIAL · HIGH
**Files:** `src/modules/schedules/{commands,repositories,services}/*`; prisma `SchedulePeriod`, `ScheduleSlot`, `ClassGroupSchedule`
**Implemented:** periods (code-unique, status); slots (day + start/end, unique per period); class-group→slot assignment (unique pair); soft-delete; authorization.
**Missing:** **no overlap detection** for a class group's slots; **no teacher-availability conflict check**; no classroom-availability integration (ClassroomBooking is separate); no recurrence/holiday exceptions.
**Tests:** NONE FOUND.
**Next:** conflict-detection service (group + teacher + classroom); reject overlapping assignment; add tests. Rated PARTIAL for this reason.

#### 14. Enrollments — YES · HIGH
**Files:** `src/modules/enrollments/{commands,repositories,services,types}/*`; prisma `Enrollment`, `EnrollmentStatusHistory`
**Implemented:** state machine DRAFT→PENDING_PAYMENT/ACTIVE→SUSPENDED/COMPLETED/CANCELLED via `ENROLLMENT_TRANSITIONS`; full status history; validates course/year/term/class-group active state & capacity; blocks suspended/dropped students; prevents duplicate ACTIVE enrollment/course; sequential numbering; initial vs current level; best-effort auto-invoice per billing policy; computed financial status; audit + domain events; portal provisioning on activation.
**Missing:** **no class-group `currentCount` decrement on cancel/suspend** (shared leak); no auto PENDING_PAYMENT→ACTIVE on full payment; no `expectedEndDate` access enforcement; no re-enroll/transfer workflow; no fee proration on mid-cycle suspension.
**Tests:** NONE FOUND for enrollment commands (progression engine tests are adjacent).
**Next:** capacity decrement; payment-driven auto-activation; expiry guard; lifecycle test suite.

### Finance

#### 15. Billing Policies — YES · MEDIUM
**Files:** `src/modules/billing/{commands,repositories,schemas}/* (billing-policy.*)`; prisma `EnrollmentBillingPolicy`
**Implemented:** invoiceMode SINGLE/INSTALLMENT; activationRule (MANUAL/AFTER_*); autoGenerateInvoiceOnEnrollment; installment config; wallet-credit-on-enrollment flag; isDefault/org; audit.
**Missing:** no policy validation on enrollment triggers; no auto-assignment by course/level; no bulk updates.
**Tests:** NONE FOUND.
**Next:** add creation/validation/audit tests.

#### 16. Fee Definitions — YES · MEDIUM
**Files:** `src/modules/billing/{commands,repositories,schemas}/* (fee-definition.*)`; prisma `FeeDefinition`
**Implemented:** code unique/org; feeType & appliesTo enums; defaultAmount Decimal(10,2); isMandatory; priority; status; audit.
**Missing:** no appliesTo validation vs actual state; no archive migration; no historical price versioning.
**Tests:** NONE FOUND.
**Next:** unique-code + application tests; track historical amounts.

#### 17. Invoices — YES · LOW
**Files:** `src/modules/finance/{commands,repositories}/* (create/update/cancel-invoice)`; prisma `Invoice`
**Implemented:** per-org number sequence (FAT-XXXXXX) generated atomically with items; total = subtotal − discount + tax; balance init = total; status PENDING→PARTIALLY_PAID→PAID/OVERDUE/CANCELLED; discount/tax via AppliedDiscount/AppliedTax; ledger entry; INVOICE_CREATED event; audit.
**Missing:** no recurring invoices, template cloning, batch generation, or reminder/escalation.
**Tests:** financial `integrity-checks.service.test.ts` validates balance formulas; no direct command tests.
**Next:** command-level tests for multi-item + discount/tax invoices.

#### 18. Invoice Items — YES · LOW
**Files:** `create-invoice.command.ts` (embedded); `finance/repositories/invoice.repository.ts`; prisma `InvoiceItem`
**Implemented:** created in the invoice transaction; priority from ITEM_TYPE_PRIORITY; totalPrice = qty×unit; balance init = total; paidAmount 0; status PENDING/PARTIALLY_PAID/PAID; ordered by priority for allocation; cascade delete; optional feeDefinition link.
**Missing:** no item-level discount/tax override; no inventory link.
**Tests:** exercised indirectly via payment-confirmation allocation tests.
**Next:** test item status transitions under multi-split payments.

#### 19. Payment Splits — YES · MEDIUM
**Files:** `finance/commands/register-payment.command.ts`; prisma `PaymentSplit`
**Implemented:** splits created on registration; methods CASH/BANK_TRANSFER/MPESA/EMOLA/POS/CARD/CHEQUE/OTHER; amount Decimal(15,2); reference/notes; sum aggregated at confirmation to determine new money; kept separate from allocations.
**Missing:** no duplicate-split detection; no split reversal/adjustment; no gateway reconciliation.
**Tests:** indirect via confirm-payment tests; no dedicated split tests.
**Next:** split-sum edge tests (rounding, zero, multiple).

#### 20. Payment Allocations — YES · LOW
**Files:** `finance/commands/confirm-payment.command.ts`; `wallets/commands/apply-wallet-credit.command.ts`; `finance/commands/allocate-payment.command.ts` (stub); prisma `PaymentAllocation`
**Implemented:** two-phase — wallet credit then new money, allocated to items by priority; excess → wallet overpayment; per-item `Math.min` guard prevents over-allocation; updates item paid/balance + status, invoice paid/balance + status; allocationType PAYMENT/WALLET_CREDIT/ADJUSTMENT/REFUND_REVERSAL; all within `db.$transaction` with row locks; Decimal→number conversion consistent.
**Missing:** manual allocation override stubbed (throws); no allocation reversal audit; single-invoice per payment; no before/after allocation snapshot.
**Tests:** integrity checks validate allocation-sum = invoice.paidAmount; wallet concurrency tests.
**Next:** implement manual override with audit; split-across-items edge tests.

#### 21. Student Wallet — YES · LOW
**Files:** `src/modules/wallets/{commands,repositories,services}/*`; prisma `StudentWallet`, `StudentWalletTransaction`, `CreditApplication`
**Implemented:** one wallet per (org, student); ledger-based balance = SUM(transactions) — no drift; signed amounts; types DEPOSIT/OVERPAYMENT/CREDIT_APPLIED/REFUND/ADJUSTMENT/PROMOTIONAL_CREDIT; row-lock (UPDLOCK) prevents double-spend; overpayment crediting, wallet refunds, manual credit application — all transactional with balance re-validation.
**Missing:** suspension not enforced (status exists, no command); no manual ADJUSTMENT command; no promo expiry; no txn caps.
**Tests:** `wallet-concurrency.test.ts` (+ integration) — lock prevents double-spend.
**Next:** negative-balance tests; suspension enforcement; audited manual adjustment.

#### 22. Receipts — YES · LOW
**Files:** `finance/commands/{issue,cancel}-receipt.command.ts`; `finance/services/receipt-cancellation.service.ts`; prisma `Receipt`
**Implemented:** per-org number (REC-XXXXXX) generated atomically; issued only for CONFIRMED payments; one receipt per payment; amount = sum of allocations; status ISSUED/PARTIALLY_REFUNDED/CANCELLED with cancel audit fields; refund updates refundedAmount + status; ledger + RECEIPT_ISSUED event.
**Missing:** no template/format customization, reissue, digital signing/email, or batch export.
**Tests:** `receipt-cancellation.test.ts` — cancellation, status, audit trail.
**Next:** issuance-constraint tests; digital receipt format.

### Assessment & Grades

#### 23. Grade Engine — YES · MEDIUM
**Files:** `src/modules/grades/services/grade-calculation.service.ts`; `assessments/services/grade-calculator.service.ts` (legacy); `grades/commands/*`
**Implemented:** weighted average (normalized to total weight) & simple average; grade normalization to 0–100; rounding modes ROUND/NEAREST/FLOOR/CEIL/1-2dp/NONE; required-component-missing → BLOCKED; pass/fail vs minimumPassingGrade; optional RECOVERY_REQUIRED; attendance gate present (unused); terminal states set completedAt; cascade to level progress; publishes SUBJECT_PASSED/FAILED.
**Missing:** recovery/remedial second-attempt replacement logic; attendance never populated (null); a parallel legacy calculator still present.
**Tests:** NONE for the calculation engine itself (only grade-metrics visibility tests).
**Next:** comprehensive engine unit suite (weights, rounding, blocking, thresholds, boundaries).

#### 24. Assessment Policies — PARTIAL · HIGH
**Files:** `assessments/commands/{create,update}-assessment-policy.command.ts`; `grades/commands/activate-assessment-policy.command.ts`; prisma `AssessmentPolicy`
**Implemented:** calculationMethod, roundingMethod, minimumPassingGrade, allowRetake/maxRetakes, allowRecovery; one ACTIVE policy per levelSubject; activation requires ≥1 active component and (WEIGHTED) total weight == 100%; INACTIVE→ACTIVE only; audit.
**Missing:** weight validation only at activation (not at create); stored `roundingMethod` not read at calculation time (passed as param) — config-to-execution gap; "recovery" mechanics undefined; component order not validated.
**Tests:** NONE FOUND.
**Next:** test activation weight rule; read rounding from policy; document the activation checkpoint. Rated PARTIAL for these gaps.

#### 25. Assessment Events — YES · MEDIUM
**Files:** `assessments/{repositories,commands}/* (assessment, assessment-period, assessment-component)`; prisma `Assessment`, `AssessmentPeriod`, `AssessmentComponent`
**Implemented:** periods (year/term, order, status); components (type, weight, maxGrade, isRequired, order) with cumulative-weight ≤100% guard on add; assessment status DRAFT→SCHEDULED→OPEN→GRADED (+CANCELLED/ARCHIVED); re-grade requires editReason; publication gated on GRADED.
**Missing:** LOCKED status referenced in grading guard but never set by any command (no lock/unlock command); no assessmentDate-within-period validation; cancel doesn't cascade to results; component type purely informational.
**Tests:** repository scoping test only; no lifecycle/transition tests.
**Next:** add/deprecate lock command; test transitions + publication gating.

#### 26. StudentAssessmentResult — YES · HIGH
**Files:** `grades/commands/{create,update,cancel}-student-assessment-result.command.ts`; `assessments/commands/bulk-grade-assessment.command.ts`; prisma `StudentAssessmentResult`, `AssessmentResult`, `GradeChangeLog`, `AssessmentPublication`
**Implemented:** unique (enrollment, component); normalizedGrade computed on create/update; grade ≤ maxGrade guard; status DRAFT/SUBMITTED/GRADED/CANCELLED; audit; GradeChangeLog captures old→new on re-grade; publication sets PUBLISHED + timestamp/user; bulk grading cascades progress recalculation; sourceType CONTINUOUS/SCHEDULED_EVENT/RECOVERY.
**Missing:** **dual model** AssessmentResult vs StudentAssessmentResult with different status enums; invalidate touches only AssessmentResult → possible inconsistency; single create/update does NOT auto-recalc subject progress (only bulk does); no retake best-of logic (latest overwrites); no post-publication grade lock.
**Tests:** NONE for create/update/change-log/cascade.
**Next:** reconcile dual model; auto-cascade progress on single grade; add tests.

#### 27. StudentSubjectProgress — YES · MEDIUM
**Files:** `assessments/commands/recalculate-student-subject-progress.command.ts`; `grades/commands/calculate-student-subject-progress.command.ts`; prisma `StudentSubjectProgress`
**Implemented:** unique (enrollment, levelSubject); status NOT_STARTED/IN_PROGRESS/PASSED/FAILED/INCOMPLETE/BLOCKED derived from grade-calc result (RECOVERY_REQUIRED→FAILED); completedAt on PASSED/FAILED; progressReason stored; upsert; cascade to level progress; SUBJECT_PASSED/FAILED events.
**Missing:** attendance percentage always null (gate never active); no NOT_STARTED vs IN_PROGRESS refinement; no best-attempt/recovery override; no PASSED→FAILED reversal on invalidation.
**Tests:** NONE FOUND for derivation/cascade.
**Next:** implement or remove attendance; test status derivation + cascade + events.

### Progression

#### 28. StudentLevelProgress — YES · LOW
**Files:** `prerequisites/repositories/student-level-progress.repository.ts`; `prerequisites/services/recalculate-level-progress.service.ts`
**Implemented:** 10-state status enum incl. PROMOTED / PROMOTED_WITH_PENDING_SUBJECTS; weighted level grade (credits else workloadHours); recalc aggregates passed/failed/pending + earned credits; delegates to progression engine; upsert idempotent (unique enrollment+level); cascades to course completion; calculatedAt stamped.
**Missing:** none material.
**Tests:** covered via level-progression & course-completion engine tests + approval service test.
**Next:** confirm calculatedAt on all write paths.

#### 29. StudentCourseProgress — YES · LOW
**Files:** `prerequisites/repositories/student-course-progress.repository.ts`; `prerequisites/engines/course-completion.engine.ts`
**Implemented:** pure aggregation over per-level records; COMPLETED only when all levels PASSED/PROMOTED/COMPLETED and none PROMOTED_WITH_PENDING_SUBJECTS; final grade = mean of graded levels; unique per enrollment; completedAt on completion; recalc runs transactionally after approval.
**Missing:** none material.
**Tests:** `course-completion.engine.test.ts` (7 scenarios).
**Next:** none critical.

#### 30. SubjectEligibilityEngine — YES · MEDIUM
**Files:** `prerequisites/engines/subject-eligibility.engine.ts`
**Implemented:** pure `decideSubjectEligibility` — enrollment-missing→BLOCKED; already PASSED/COMPLETED→ALREADY_COMPLETED; no prereqs→ELIGIBLE; groups AND-ed; ALL vs ANY; MUST_PASS / MUST_COMPLETE / MINIMUM_GRADE (default 50); full/group/item waivers bypass; IO wrapper scopes progress by org + studentId (cross-tenant safe).
**Missing:** **documented stub** — PENDING_PAYMENT defined but never produced; FinancialEligibilityService not wired.
**Tests:** `subject-eligibility.engine.test.ts` — 19 scenarios incl. tenant scoping + IO mocking.
**Next:** wire financial clearance when the service lands.

#### 31. LevelProgressionEngine — YES · LOW
**Files:** `prerequisites/engines/level-progression.engine.ts`
**Implemented:** modes STRICT / CONDITIONAL (maxFailed, maxPending, minimumLevelAverage) / CREDIT_BASED / MANUAL_APPROVAL; requireManualApproval flag overrides auto modes; weighted grade shared with level-progress; final-level handling; outcomes PROMOTED / PROMOTED_WITH_PENDING_SUBJECTS / BLOCKED / REQUIRES_MANUAL_APPROVAL / ELIGIBLE_TO_PROGRESS; promote updates existing enrollment (never creates).
**Missing:** **documented stub** — `requireFinancialClearance` field exists but never enforced.
**Tests:** `level-progression.engine.test.ts` — 23 scenarios (all modes, weights, override, promote).
**Next:** wire financial clearance when available.

#### 32. Manual Level Progression Approval — YES · LOW
**Files:** `prerequisites/{repositories,services,actions,components}/* (level-progression-request, review-progression-request)`; `app/(org)/academic/progression-requests/*`; `docs/academic-progression.md`
**Implemented:** idempotent request creation (no duplicate PENDING for same transition); transactional approve → request APPROVED + enrollment.currentLevelId + StudentLevelProgress PROMOTED/…PENDING + course-progress recalc; reject requires reason, leaves level unchanged; guards non-PENDING & cancelled/completed enrollment; granular RBAC (view/approve/reject); 5 audit event types; queue + detail UI.
**Missing:** none material (financial clearance inherited from engine stub).
**Tests:** `review-progression-request.service.test.ts` (6) + `progression-request-workflow.actions.test.ts` (7) — creation, duplicate, approve/reject, RBAC, audit.
**Next:** none critical; keep all writes flowing through the transactional service.

#### 33. CourseCompletionEngine — YES · LOW
**Files:** `prerequisites/engines/course-completion.engine.ts` (reused in approval service & level-progress recalc)
**Implemented:** pure `decideCourseCompletion`; PROMOTED_WITH_PENDING_SUBJECTS blocks completion; FAILED-with-no-in-progress→FAILED; else IN_PROGRESS; final grade = mean of graded levels; sums credits; completedAt only when truly complete; reused inside approval transaction (tx-scoped variant).
**Missing:** none material.
**Tests:** `course-completion.engine.test.ts` (7 scenarios).
**Next:** none critical.

---

*End of audit. No code was modified in producing this report. Defect claims (capacity leak,
schedule conflicts, dual grade model) should be re-verified against current source before remediation.*
