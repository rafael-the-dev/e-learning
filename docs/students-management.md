# Students Management

## Module Scope

Allows ORG_ADMIN and SECRETARY to manage students within the active organization. Covers registration, profile editing, status management, and soft deletion.

Does **not** cover: enrollments, payments, attendance, courses — these are future modules.

---

## Routes

| Route | Permission Required | Description |
|---|---|---|
| `/students` | `students.read` | List all students with filters |
| `/students/new` | `students.create` | Register a new student |
| `/students/[studentId]` | `students.read` | View student profile |
| `/students/[studentId]/edit` | `students.update` | Edit student data |

---

## Permissions

| Permission | Constant | Roles |
|---|---|---|
| `students.view` | `PERMISSIONS.STUDENTS_READ` | ORG_ADMIN, SECRETARY, TEACHER |
| `students.create` | `PERMISSIONS.STUDENTS_CREATE` | ORG_ADMIN, SECRETARY |
| `students.update` | `PERMISSIONS.STUDENTS_UPDATE` | ORG_ADMIN, SECRETARY |
| `students.suspend` | `PERMISSIONS.STUDENTS_SUSPEND` | ORG_ADMIN, SECRETARY |
| `students.delete` | `PERMISSIONS.STUDENTS_DELETE` | ORG_ADMIN |

---

## Student Status

| Value | Label | Description |
|---|---|---|
| `PENDING` | Pendente | Newly registered, not yet active |
| `ACTIVE` | Ativo | Currently enrolled |
| `SUSPENDED` | Suspenso | Access suspended via SuspendStudentCommand |
| `COMPLETED` | Concluído | Finished all coursework |
| `DROPPED` | Abandonado | Dropped out |

Status `SUSPENDED` can only be set via `SuspendStudentCommand` (requires `students.suspend`).  
Other status transitions are available in the Edit form (requires `students.update`).

---

## Commands

### CreateStudentCommand
- Validates input with `createStudentSchema`
- Checks for duplicate `idNumber` within the organization
- Verifies `branchId` belongs to the active organization
- Creates student with status `PENDING`
- Writes audit event `student.created`

### UpdateStudentCommand
- Validates input with `updateStudentSchema`
- Verifies student belongs to active organization (tenant isolation)
- Checks for duplicate `idNumber` excluding the current student
- Verifies `branchId` belongs to the active organization
- Writes audit event `student.updated` with old/new values

### SuspendStudentCommand
- Rejects if student is already `SUSPENDED`
- Sets status to `SUSPENDED`
- Writes audit event `student.suspended`

### SoftDeleteStudentCommand
- Sets `deletedAt` — record is hidden but not destroyed
- Writes audit event `student.deleted`
- All repository queries filter `deletedAt: null`

---

## Audit Events

| Action | Entity | Trigger |
|---|---|---|
| `CREATED` | Student | CreateStudentCommand |
| `UPDATED` | Student | UpdateStudentCommand |
| `SUSPENDED` | Student | SuspendStudentCommand |
| `DELETED` | Student | SoftDeleteStudentCommand |

---

## Tenant Isolation Rules

- `organizationId` is **never** accepted from client input.
- `organizationId` is always read from `requireOrganization()` / `requirePermission()`.
- Every repository query is filtered by `organizationId`.
- `branchId` is validated to belong to `organizationId` before assignment.
- `studentId` alone is never trusted — always verified with `findByIdInOrganization(id, organizationId)`.

---

## Validation Rules

| Field | Rule |
|---|---|
| `firstName` | Required, min 2 chars, max 100 |
| `lastName` | Required, min 2 chars, max 100 |
| `email` | Valid email format or empty, max 150 |
| `idNumber` | Unique per organization (soft-delete aware) |
| `branchId` | Must belong to active organization |

---

## Database Schema Reference

```
model Student {
  id             String    @id
  organizationId String              // tenant key
  branchId       String?             // optional, verified on write
  firstName      String
  lastName       String
  email          String?
  phone          String?
  dateOfBirth    DateTime?
  gender         String?             // MALE | FEMALE | OTHER
  address        String?
  idType         String?             // BI | PASSPORT | NUIT | OTHER
  idNumber       String?             // unique per org
  status         String              // PENDING | ACTIVE | SUSPENDED | COMPLETED | DROPPED
  notes          String?
  createdAt      DateTime
  updatedAt      DateTime
  deletedAt      DateTime?           // soft delete
  createdBy      String?
  updatedBy      String?
}
```

**Fields not in current schema** (pending migration if needed):
- `emergencyContactName`
- `emergencyContactPhone`

---

## File Structure

```
src/modules/students/
  types/index.ts              — Student interface, label maps
  schemas/student.schema.ts   — Zod schemas for all operations
  repositories/student.repository.ts — DB queries (all org-scoped)
  services/student.service.ts — Read-only service wrappers
  commands/
    create-student.command.ts
    update-student.command.ts
    suspend-student.command.ts
    delete-student.command.ts
  actions/student.actions.ts  — Server Actions (Next.js "use server")
  components/
    student-columns.tsx        — TanStack Table column definitions
    students-table.tsx         — Filter bar + DataTable + confirm dialogs
    student-form.tsx           — CreateStudentForm + EditStudentForm
    student-detail-actions.tsx — Suspend/Archive buttons for detail page

src/app/(org)/students/
  page.tsx                    — List page
  new/page.tsx                — Create page
  [studentId]/page.tsx        — Detail page
  [studentId]/edit/page.tsx   — Edit page
```

---

## Future Integration Points

- **Enrollments**: `Student.enrollments[]` — link students to courses via Enrollment model
- **Payments**: `Student.payments[]` / `Student.invoices[]` — financial records
- **Attendance**: `Student.attendances[]` — attendance records per class/subject
- **Practical Lessons**: `Student.practicalLessons[]` — driving lesson sessions
