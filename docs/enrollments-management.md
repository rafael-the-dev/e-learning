# Enrollments Management

## Scope

The Enrollments module allows ORG_ADMIN and SECRETARY roles to register students in courses within the active organization. It enforces multi-tenant isolation, RBAC, status lifecycle control, class group capacity management, and full audit logging.

---

## Permissions

| Permission              | ORG_ADMIN | SECRETARY |
|-------------------------|-----------|-----------|
| enrollments.view        | ✓         | ✓         |
| enrollments.create      | ✓         | ✓         |
| enrollments.update      | ✓         | ✓         |
| enrollments.activate    | ✓         | ✓         |
| enrollments.suspend     | ✓         | ✗         |
| enrollments.cancel      | ✓         | ✗         |
| enrollments.complete    | ✓         | ✗         |
| enrollments.delete      | ✓         | ✗         |

---

## Routes

| Route                               | Description              |
|-------------------------------------|--------------------------|
| `/enrollments`                      | List with filters & stats |
| `/enrollments/new`                  | Create enrollment wizard  |
| `/enrollments/[enrollmentId]`       | Enrollment detail         |
| `/enrollments/[enrollmentId]/edit`  | Edit enrollment           |

---

## Status Lifecycle

```
DRAFT ──────────────────► PENDING_PAYMENT
  │                              │
  └──────────► ACTIVE ◄──────────┘
                  │
       ┌──────────┼──────────┐
       ▼          ▼          ▼
  SUSPENDED   COMPLETED  CANCELLED
       │
       └──► ACTIVE
```

### Allowed Transitions

| From            | To                              |
|-----------------|---------------------------------|
| DRAFT           | PENDING_PAYMENT, ACTIVE         |
| PENDING_PAYMENT | ACTIVE                          |
| ACTIVE          | SUSPENDED, COMPLETED, CANCELLED |
| SUSPENDED       | ACTIVE                          |
| COMPLETED       | (terminal — no transitions)     |
| CANCELLED       | (terminal — no transitions)     |

Invalid transitions are blocked at the command layer with a `BusinessRuleError`.

---

## Tenant Isolation

- `organizationId` is always derived from `requireOrganization()` on the server. Never accepted from client input.
- All relationship IDs are validated to belong to the active `organizationId`:
  - `branchId` — must belong to org
  - `studentId` — must belong to org
  - `courseId` — must belong to org
  - `courseLevelId` — must belong to selected course
  - `classGroupId` — must belong to org and match selected course

---

## Business Rules

1. `enrollmentNumber` is unique per organization, auto-generated as a zero-padded sequential number.
2. A student cannot have two `ACTIVE` enrollments in the same course.
3. Student must not be `SUSPENDED` or `DROPPED`.
4. Course must have `status = ACTIVE`.
5. CourseLevel (if provided) must have `status = ACTIVE`.
6. ClassGroup (if provided) must have `status = ACTIVE` or `FORMING`.
7. ClassGroup `courseLevelId` must match the enrollment's `courseLevelId` when both are set.
8. ClassGroup `currentCount` must be less than `capacity` before adding an enrollment.
9. Enrollments with `status = ACTIVE` cannot be directly deleted — must be cancelled first.
10. Deleting a non-cancelled/non-completed enrollment decrements the class group counter.

---

## Class Group Capacity Rules

- `currentCount` is incremented when an enrollment is created with a `classGroupId`.
- `currentCount` is decremented when:
  - An enrollment is cancelled or completed (releases the seat).
  - An enrollment is updated to a different class group (decrements old, increments new).
  - An enrollment is soft-deleted while still holding a seat.
- The `countActiveEnrollmentsByClassGroup` repository function counts enrollments that are neither `CANCELLED` nor `COMPLETED`.

---

## Audit Events

| Event                 | Triggered by                   |
|-----------------------|-------------------------------|
| `enrollment.created`  | CreateEnrollmentCommand        |
| `enrollment.updated`  | UpdateEnrollmentCommand        |
| `enrollment.activated`| ActivateEnrollmentCommand      |
| `enrollment.suspended`| SuspendEnrollmentCommand       |
| `enrollment.cancelled`| CancelEnrollmentCommand        |
| `enrollment.completed`| CompleteEnrollmentCommand      |
| `enrollment.deleted`  | SoftDeleteEnrollmentCommand    |

Every status change also writes an `EnrollmentStatusHistory` record with `fromStatus`, `toStatus`, `reason`, and `changedBy`.

---

## Module Architecture

```
src/modules/enrollments/
  types/index.ts              — Enrollment, EnrollmentStatusHistory, ENROLLMENT_STATUS, ENROLLMENT_TRANSITIONS
  schemas/enrollment.schema.ts — Zod schemas for create, update, activate, suspend, cancel, complete, delete
  repositories/enrollment.repository.ts — All Prisma queries, scoped to organizationId
  services/enrollment.service.ts — Service layer wrapping repository calls
  commands/
    create-enrollment.command.ts
    update-enrollment.command.ts
    activate-enrollment.command.ts
    suspend-enrollment.command.ts
    cancel-enrollment.command.ts
    complete-enrollment.command.ts
    delete-enrollment.command.ts
  actions/enrollment.actions.ts — Server Actions using runAction() wrapper
  components/
    enrollment-columns.tsx       — TanStack Table column definitions
    enrollments-table.tsx        — Client table with filters and action dialogs
    enrollment-form.tsx          — Create and Edit forms
    enrollment-status-actions.tsx — Inline status action buttons for detail page
```

---

## Future Payment Integration

When the Payments module is implemented:

1. Enrollments created from `DRAFT → ACTIVE` may require generating an invoice first.
2. The `PENDING_PAYMENT` status will be used when an invoice is required but not yet paid.
3. Payment confirmation should trigger `PENDING_PAYMENT → ACTIVE` automatically.
4. `CreateEnrollmentCommand` has a TODO comment placeholder for this flow.

---

## Future Attendance Integration

When the Attendance module is activated:

1. Attendance records will be linked to `enrollmentId` or derived from the student's active enrollment in a class group.
2. The enrollment detail page has a placeholder section for attendance that will be wired to real data.

---

## Future Certificate Integration

When the Certificates module is activated:

1. Completing an enrollment (`ACTIVE → COMPLETED`) may trigger certificate generation.
2. The enrollment detail page has a placeholder section for certificates.
