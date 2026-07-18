# ADR-017 — Assignment-Scoped Teacher Execution in the Examination Engine

- **Status:** **Accepted** · Implemented (2026-07-18) · **Examination Engine re-frozen**
- **Date:** 2026-07-18
- **Scope:** Examination Engine — write authorization for exam attendance + result entry
- **Amends:** [ADR-013](./ADR-013-examination-engine.md) (Examination Engine design freeze) —
  specifically the **deferral** of teacher assignment-scoped writes (Phase 6 / Phase 7
  headers; ADR-013 D6). This ADR does **not** rewrite ADR-013; it records that the
  deferred behaviour is now implemented and re-freezes the engine.
- **Builds on / enables:** the upcoming Teacher Examination Portal (Phase 0 investigation).

## Context

The Examination Engine was frozen with teacher assignment-scoped writes **explicitly
deferred**. Attendance (Phase 6) and result entry (Phase 7) authorized on the **global
admin permission only** (`exams.markAttendance` / `exams.correctAttendance` /
`exams.enterResults` / `exams.submitResults`), held by admin/secretary — the command
headers state: *"Teacher assignment-scoped marking/entry is DEFERRED."* The `TEACHER`
role held **no** `exams.*` permission.

A Phase-0 investigation for the Teacher Examination Portal confirmed the gap: a teacher
is linked to a session **only** via an explicit `ExamInvigilatorAssignment`
(`role ∈ CHIEF | INVIGILATOR | MARKER | OBSERVER`); there is no separate examiner model.
Crucially, **no command verifies session assignment — only global RBAC**. Therefore a
teacher portal could not scope writes safely by adding a UI layer alone: granting
`TEACHER` the global write permissions would also open the **admin API endpoints** (the
same commands) to teachers for *any* session, since those routes are thin shells over the
commands.

## Problem

Let a teacher mark/correct attendance and enter/update/submit results **only for the
sessions they are actively assigned to, in an authorizing role**, without weakening
admin/secretary behaviour and without a teacher being able to act on unassigned sessions
through *any* endpoint.

## Decision

Implement the deferred assignment-scoped write authorization directly in the engine
commands (additive security hardening — the "deferred" work ADR-013 anticipated).

1. **Assignment model — explicit only.** Access derives from an active
   `ExamInvigilatorAssignment` on the target session. Never inferred from teaching the
   subject/class.

2. **One new permission (NOT an admin permission):** `exams.executeAssignedSessions`,
   granted to `TEACHER`. It grants **no** org-wide exam write on its own — it only unlocks
   the assignment-scoped path. (A single permission; the role-set is the real per-operation
   gate. Splitting into per-operation teacher permissions is deferred until a real
   requirement exists — it can be added later without changing this model.)

3. **Authorization gate:**
   ```
   admin permission (operation-specific)  → allow                    [unchanged]
   OR  exams.executeAssignedSessions
         → resolve Teacher from the authenticated user (server-side)
         → resolve the TARGET session from the real object being written
         → active ExamInvigilatorAssignment(org, session, teacher)
         → role authorizes the operation
         → allow
   else → AuthorizationError
   ```

4. **Role → operation matrix:**

   | Operation | CHIEF | INVIGILATOR | MARKER | OBSERVER |
   |---|:---:|:---:|:---:|:---:|
   | Mark attendance | ✅ | ✅ | ✅ | ❌ |
   | Correct attendance | ✅ | ✅ | ✅ | ❌ |
   | Enter result | ✅ | ❌ | ✅ | ❌ |
   | Update result | ✅ | ❌ | ✅ | ❌ |
   | Submit result | ✅ | ❌ | ✅ | ❌ |

5. **In-transaction gate.** The assignment check runs **inside the mutation
   transaction**, after the session is resolved — no check-then-mutate window (an
   assignment removed between authorize and write is denied).

6. **Canonical session resolution.** Each command authorizes against the session the
   written object canonically belongs to: attendance → candidate → session; result
   update → result → candidate → session; submit → result → candidate → session. A
   client-supplied `sessionId` is never trusted as the authorization target when the
   object already has a canonical relation.

7. **Admin path preserved and specific.** The admin bypass is keyed to the operation's
   **specific** permission (`exams.markAttendance`, `exams.enterResults`, …), never a
   nominal "is admin" role. Admin/secretary behaviour and events are unchanged.

8. **Teacher identity is server-resolved.** `teacherId` is resolved from the
   authenticated user (`getTeacherByUserId`); it is **never** accepted from input. A user
   who holds `exams.executeAssignedSessions` but has no active Teacher record is
   **denied** — never an admin fallback.

9. **Batch safety.** Bulk attendance/results delegate to the single command per item,
   each re-running the in-tx gate against that item's own session — a mixed-session batch
   can never produce an unauthorized write; the Teacher Portal sends single-session batches.

### Affected commands

`MarkExamCandidateAttendanceCommand`, `CorrectExamCandidateAttendanceCommand`,
`CreateExamResultCommand`, `UpdateDraftExamResultCommand`, `SubmitExamResultCommand`, and
the bulk runners (`BulkMarkExamAttendance`, `BulkCreateExamResults`,
`BulkSubmitExamResults`). Shared gate: `commands/execution-scope-shared.ts`
(`assertExamWriteCapability` for `authorize()`, `enforceExamSessionWriteScope` in-tx).

### The teacher's write ceiling is unchanged

The teacher flow still ends at `SUBMITTED`. This ADR does **not** grant review, approve,
publish, integrate, appeals, or any scheduling/registration capability. Result authorship
(`markerId`) and the marker ≠ reviewer ≠ approver separation are untouched.

## Consequences

**Positive.** Teachers can safely execute their assigned sessions on **both** portals
(the admin endpoints now also enforce assignment for a teacher). Admin/secretary flows are
byte-for-byte unchanged. The gate is race-safe (in-tx) and fail-closed. The RBAC surface
grows by exactly one permission.

**Negative.** The frozen engine was reopened for a scoped, additive change (justified: it
is the deferred behaviour, and it is security-hardening, not a behaviour change to existing
flows). A small extra read (teacher + assignment) is incurred on the teacher path;
UpdateDraft now also resolves the candidate/session (a correctness improvement).

## Security tests (added)

Admin path unchanged (specific permission authorizes without assignment; the wrong-
operation admin permission does not; neither permission → denied). Teacher path matrix
(CHIEF/INVIGILATOR/MARKER/OBSERVER × attendance/results per the table); denied when: no
assignment, assignment on another session, another org, or permission-without-Teacher.
In-tx scoping (assignment lookup is org+session+teacher, client passed). Regression: the
full engine suite (832 tests) is green; state machines and the teacher write-ceiling are
intact.

## Alternatives considered

- **Portal-layer gate + global teacher permissions** — rejected: granting `TEACHER` the
  global write permissions opens the admin endpoints to teachers for any session; safety
  would depend on auditing every admin endpoint to exclude teachers (fragile, one miss = a
  hole).
- **Read-only teacher portal (defer writes)** — viable but strictly less; the gap would
  remain and the portal's core operational value (mark/enter/submit) would be absent.
- **Split into per-operation teacher permissions now** — rejected for v1: increases config
  surface with no real requirement; can be introduced later without changing the model.

## Review

Revisit if: organizations need to enable teacher attendance but forbid teacher result
entry (introduce granular teacher permissions); a separate examiner/grader model replaces
the invigilator-role approach; or `ExamInvigilatorAssignment` gains a soft-delete/active
flag (the "active" check must then honour it). Any such change is a new ADR.

**Examination Engine: amended by ADR-017 · re-frozen.**
