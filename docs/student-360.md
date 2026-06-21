# Student 360 Profile

## Purpose

`/students/[studentId]` is the single operational view of a student, consolidating enrollments, academic progress, attendance, grades, finance, wallet, documents, and timeline into one page. It answers:

- Who is this student?
- What courses/enrollments does the student have?
- Is the student active, at risk, blocked or completed?
- Does the student owe money?
- Is the student below attendance requirements?
- What are the latest academic and financial events?
- What action should staff take next?

It is a composition layer — almost every figure on the page is computed by an existing module service (finance statement, attendance calculator, grade engine, prerequisites/progression engines, student timeline). The only genuinely new module is Documents.

---

## Layout

| Section | Component | Always loaded? |
|---|---|---|
| Header (name, code, status, contact, quick actions) | `StudentProfileHeader` | yes |
| Health score | `StudentHealthCard` | yes |
| Alerts / watchlist | `StudentAlertsPanel` | yes |
| KPI summary cards (×8) | `StudentSummaryCards` | yes |
| Tabs nav | `Student360TabsNav` | yes |
| Active tab content | one of the 8 tab components below | only the active tab |

Quick actions in the header: Edit Student, New Enrollment, New Invoice, Register Payment, Contact (mailto/tel dropdown), Upload Document — each gated by its own permission.

---

## Tabs

| Key | Component | Gating permission | Data source |
|---|---|---|---|
| `overview` | `StudentOverviewTab` | always visible | core data (below) |
| `enrollments` | `StudentEnrollmentsTab` | `ENROLLMENTS_VIEW` | core data — no extra query |
| `finance` | `StudentFinanceTab` | `INVOICES_VIEW` | core data — no extra query |
| `attendance` | `StudentAttendanceTab` | `ATTENDANCE_SESSIONS_VIEW` | core + `getAttendanceTabData` |
| `grades` | `StudentGradesTab` | `GRADES_VIEW` | core + `getGradesTabData` |
| `progress` | `StudentProgressTab` | `STUDENT_LEVEL_PROGRESS_VIEW` or `STUDENT_COURSE_PROGRESS_VIEW` | core + `getProgressTabData` |
| `documents` | `StudentDocumentsTab` | `STUDENT_DOCUMENTS_VIEW` | `getDocumentsTabData` |
| `timeline` | `StudentTimelineTab` | `STUDENT_TIMELINE_VIEW` | `getTimelineTabData` |

A tab that the caller lacks permission for is not rendered as a trigger at all (same pattern as `/subjects/[subjectId]`). If the `?tab=` query param requests a tab the user can't see, the page silently falls back to `overview` (`resolveActiveStudent360Tab`).

---

## Data loading strategy

The page reads `?tab=` and `?page=` from the URL. `Student360TabsNav` is a thin client wrapper around shadcn `Tabs` that calls `router.push` on tab change instead of holding local state — so switching tabs is a real navigation, and the server component only fetches the active tab's heavier data.

- **Core data** (`getStudent360Core`) — fetched on every request regardless of active tab: student, all enrollments, financial statement, wallet + 3 recent transactions, subject/level/course progress, attendance summary for active enrollments, last activity timestamp, 5 recent timeline events, document count, pending-justification count. This feeds the header, health score, alerts, summary cards, and the Overview tab — all from one set of parallel queries (`Promise.all`), no duplicate fetching across those four UI pieces.
- **Per-tab data** — only fetched for whichever tab is active:
  - Attendance: paginated raw attendance records (`findAttendanceRecordsByStudent`, real `skip/take`) + paginated justifications.
  - Grades: paginated assessment results (`findStudentAssessmentResults`, real pagination).
  - Progress: level-subjects of the current enrollment's level + eligibility evaluation per subject (`evaluateSubjectEligibility`), bounded by curriculum size (typically <20 subjects).
  - Documents: full document list for the student (typically a handful of rows).
  - Timeline: paginated timeline events (`getStudentTimeline`, real pagination), 20/page.

**Finance is the one exception to "real server pagination":** the Finance tab renders the *entire* `getStudentFinancialStatement()` result (invoices/payments/receipts/refunds), paginated client-side over the already-fetched array (`PaginatedTable`). This is intentional — the spec calls for reusing the Student Financial Statement service verbatim rather than recomputing finance figures, and the array is inherently bounded (one student's financial history, not the whole tenant's), so no N+1 or unbounded query is introduced.

---

## Health Score

`calculateHealthScore()` in `student-health.service.ts` is a pure function (no I/O) so it's fully unit-tested without a database. Weighted 0–100:

| Category | Weight | Formula |
|---|---|---|
| Academic | 30% | 100, −10 per `FAILED` subject (cap −40), −20 if any `RECOVERY_REQUIRED` level, −40 if any `BLOCKED` level |
| Finance | 25% | 100, −25 if outstanding balance > 0, −35 if any invoice is `OVERDUE` |
| Attendance | 20% | average attendance % across active-enrollment subjects; capped at 50 if any subject is `BELOW_REQUIRED` |
| Enrollment status | 15% | 100 if ≥1 `ACTIVE`, 60 if only `COMPLETED`, 30 if `SUSPENDED`/`PENDING_PAYMENT`, 0 if none |
| Activity | 10% | 100 if a timeline event in the last 30 days, 60 if within 90, 20 otherwise/never |

Labels: 90–100 Excelente, 75–89 Saudável, 50–74 Requer Atenção, 0–49 Crítico.

`topReasons` = the 3 deductions with the largest weighted impact. `recommendedAction` is derived from whichever category scored lowest.

**This is a v1 formula**, not a spec'd algorithm — the original requirements gave weight buckets and deduction *reasons* but not exact coefficients. The coefficients above are a deliberate, documented judgment call; tune them here (and in `student-health.service.test.ts`) if the business wants different sensitivity.

---

## Alerts

`computeStudentAlerts()` in `student-alerts.service.ts` is the second pure function, covering the spec's three severity tiers:

| Severity | Rule |
|---|---|
| CRITICAL | blocked level progress, overdue invoice(s), below-required attendance, failed required subject |
| HIGH | recovery required, pending refund, pending attendance justification, zero documents on file |
| MEDIUM | incomplete assessment(s), inactive enrollment (has an enrollment but none `ACTIVE`) |

Each alert carries a PT-PT message, a recommended action, and a `?tab=` deep link rendered via the shared `DashboardInsightRow` component (reused from the Executive Dashboard).

---

## Documents (new module)

No file-storage backend exists anywhere in this codebase — even Lesson Attachments are metadata-only (staff paste a URL). `src/modules/student-documents/` follows that exact same convention: a `StudentDocument` row stores `documentType`, `fileName`, `fileUrl` (external link), `fileSize`, `status` (`PENDING`/`VERIFIED`/`REJECTED`), `uploadedBy`/`verifiedBy`/`verifiedAt`. There is no binary upload pipeline.

Commands: `CreateStudentDocumentCommand`, `DeleteStudentDocumentCommand` (soft delete), `VerifyStudentDocumentCommand` (approve/reject).

---

## Permissions

| Permission | Constant | Used for |
|---|---|---|
| `studentDocuments.view` | `STUDENT_DOCUMENTS_VIEW` | Documents tab visibility |
| `studentDocuments.upload` | `STUDENT_DOCUMENTS_UPLOAD` | Upload quick action + drawer |
| `studentDocuments.delete` | `STUDENT_DOCUMENTS_DELETE` | Delete document |
| `studentDocuments.verify` | `STUDENT_DOCUMENTS_VERIFY` | Approve/reject a pending document |

Default role assignments: ORG_ADMIN gets everything (wildcard minus `organizations.delete`); SECRETARY gets view/upload/verify (not delete — mirrors how `STUDENTS_DELETE` is also withheld from SECRETARY). All other tab-gating permissions (`ENROLLMENTS_VIEW`, `INVOICES_VIEW`, `ATTENDANCE_SESSIONS_VIEW`, `GRADES_VIEW`, `STUDENT_LEVEL_PROGRESS_VIEW`, `STUDENT_COURSE_PROGRESS_VIEW`, `STUDENT_TIMELINE_VIEW`) already existed before this feature.

The pure RBAC gate lives in `student-360-access.service.ts` (`getStudent360TabAccess`, `resolveActiveStudent360Tab`) — it takes a `can(permission)` predicate rather than a real `Ability`, so tab visibility is unit-tested without constructing auth context.

---

## Tenant Isolation

Every query in `student-360.repository.ts` and `student-document.repository.ts` takes `(studentId, organizationId, ...)` explicitly and filters by both — `studentId` is never trusted alone. `organizationId` always comes from `requirePermission()`'s server-side `AuthContext`, never from the client or the route param. The page calls `getStudent360Core(studentId, context.organizationId)`, which calls `getStudentById` first — a student belonging to a different organization throws `NotFoundError`, and the page resolves that into a 404 via `notFound()`, the same pattern as every other detail page in this codebase.

---

## Performance

- Core data is one batch of parallel queries (`Promise.all`), not sequential round-trips.
- Heavy, genuinely unbounded lists (attendance records, assessment results, timeline events) use real server-side `skip/take` pagination.
- Attendance percentages are pre-aggregated by `calculateEnrollmentAttendanceSummary` (existing service) — the page never loads raw attendance rows for the health score or summary cards, only for the explicit "Recent Records" table.
- Progression eligibility is evaluated per level-subject of the *current* level only (bounded by curriculum size), not across the student's entire history.

---

## Module Structure

```
src/modules/students/student-360/
├── types/index.ts                          Health score, alerts, summary cards, tab keys
├── repositories/
│   └── student-360.repository.ts           Paginated attendance records, level/course progress by student, last activity
├── services/
│   ├── student-360.service.ts              Core data orchestration + per-tab data fetchers
│   ├── student-health.service.ts           calculateHealthScore() — pure
│   ├── student-alerts.service.ts           computeStudentAlerts() — pure
│   └── student-360-access.service.ts        Pure RBAC tab gate
├── components/
│   ├── student-profile-header.tsx
│   ├── student-quick-actions.tsx
│   ├── upload-document-drawer.tsx
│   ├── student-health-card.tsx
│   ├── student-alerts-panel.tsx
│   ├── student-summary-cards.tsx
│   ├── student-360-tabs-nav.tsx
│   ├── student-overview-tab.tsx
│   ├── student-enrollments-tab.tsx
│   ├── student-finance-tab.tsx
│   ├── student-attendance-tab.tsx
│   ├── student-grades-tab.tsx
│   ├── student-progress-tab.tsx
│   ├── student-documents-tab.tsx
│   ├── student-timeline-tab.tsx
│   └── paginated-table.tsx                 Client-side slice pagination for bounded arrays
└── __tests__/

src/modules/student-documents/               New module (see above)
```

Route: `src/app/(org)/students/[studentId]/page.tsx` (existing route, rewritten — no new route was created).

---

## Known Limitations

- **Teacher scoping is not implemented.** No module in this codebase currently restricts a TEACHER role to their own assigned class groups/subjects, so this page doesn't either. The spec explicitly allows this ("if teacher scoping is implemented"). A TEACHER with `STUDENTS_READ` sees the full Student 360 for any student in the organization, same as today's behavior everywhere else.
- **Documents are metadata-only.** No binary file storage exists anywhere in the app; `StudentDocument.fileUrl` is a pasted link, identical to how `LessonAttachment` already works. "Upload Document" does not handle actual file bytes.
- **Finance tables are not server-paginated.** See "Data loading strategy" above — acceptable because the dataset is bounded per student, not per tenant.
- **Health score coefficients are a v1 judgment call**, not a contractually specified formula — see "Health Score" above.
- **Export/Print was deferred**, per the spec's explicit instruction not to block the first version on it.
