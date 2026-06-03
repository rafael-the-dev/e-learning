# Teachers Management Module

## Scope

Allows `ORG_ADMIN` and `SECRETARY` roles to manage teachers and instructors inside the active organization. Teachers can be assigned to branches and to subjects (when the Courses module is active).

## Routes

| Route | Permission | Description |
|-------|------------|-------------|
| `/teachers` | `teachers.read` | List all teachers with search, status, and branch filters |
| `/teachers/new` | `teachers.create` | Create a new teacher |
| `/teachers/[teacherId]` | `teachers.read` | View teacher profile, subjects, and future placeholders |
| `/teachers/[teacherId]/edit` | `teachers.update` | Edit teacher information |

## Permissions

| Permission | Constant | Roles |
|------------|----------|-------|
| `teachers.read` | `TEACHERS_READ` | ORG_ADMIN, SECRETARY, TEACHER, SUPER_ADMIN |
| `teachers.create` | `TEACHERS_CREATE` | ORG_ADMIN, SECRETARY, SUPER_ADMIN |
| `teachers.update` | `TEACHERS_UPDATE` | ORG_ADMIN, SECRETARY, SUPER_ADMIN |
| `teachers.suspend` | `TEACHERS_SUSPEND` | ORG_ADMIN, SECRETARY, SUPER_ADMIN |
| `teachers.delete` | `TEACHERS_DELETE` | ORG_ADMIN, SUPER_ADMIN |
| `teachers.assignSubject` | `TEACHERS_ASSIGN_SUBJECT` | ORG_ADMIN, SUPER_ADMIN |

## Module Structure

```
src/modules/teachers/
  types/index.ts                     — Teacher, TeacherWithSubjects, status/gender labels
  schemas/teacher.schema.ts          — Zod schemas for all commands
  repositories/teacher.repository.ts — All DB queries, scoped to organizationId
  services/teacher.service.ts        — Read-only wrappers for pages
  commands/
    create-teacher.command.ts
    update-teacher.command.ts
    suspend-teacher.command.ts
    delete-teacher.command.ts
    assign-subject.command.ts
    remove-subject.command.ts
  actions/teacher.actions.ts         — Server Actions (Next.js)
  components/
    teacher-columns.tsx              — TanStack Table column definitions
    teachers-table.tsx               — Client table with filters and confirm dialogs
    teacher-form.tsx                 — Create + Edit forms (React Hook Form + Zod)
    teacher-detail-actions.tsx       — Suspend/Archive buttons on detail page
```

## Commands

Every command follows `validate() → authorize() → execute()` via `BaseCommand`.

| Command | Permission | Audit Action |
|---------|------------|--------------|
| `CreateTeacherCommand` | `teachers.create` | `teacher.created` |
| `UpdateTeacherCommand` | `teachers.update` | `teacher.updated` |
| `SuspendTeacherCommand` | `teachers.suspend` | `teacher.suspended` |
| `SoftDeleteTeacherCommand` | `teachers.delete` | `teacher.deleted` |
| `AssignTeacherSubjectCommand` | `teachers.assignSubject` | `teacher.subject_assigned` |
| `RemoveTeacherSubjectCommand` | `teachers.assignSubject` | `teacher.subject_removed` |

## Teacher Fields

| Field | Type | Notes |
|-------|------|-------|
| `firstName` / `lastName` | String | Required |
| `fullName` | Computed | `firstName + " " + lastName` |
| `gender` | String? | MALE \| FEMALE \| OTHER |
| `dateOfBirth` | DateTime? | |
| `idType` / `idNumber` | String? | BI, PASSPORT, NUIT, OTHER |
| `phone` / `email` | String? | |
| `address` | String? | |
| `licenseNumber` | String? | Unique per organization |
| `specialization` | String? | Free text |
| `status` | String | ACTIVE \| SUSPENDED \| INACTIVE |
| `branchId` | String? | Foreign key to `branches` |
| `organizationId` | String | Set server-side — never from client |

## Status Transitions

- Default status on creation: `ACTIVE`
- `ACTIVE → SUSPENDED`: via `SuspendTeacherCommand` only (not editable via form)
- `SUSPENDED → ACTIVE` or `INACTIVE`: via `UpdateTeacherCommand`
- The edit form blocks setting `SUSPENDED` directly — directs to the suspend action

## Tenant Isolation Rules

1. `organizationId` is always resolved from `requireOrganization()` — never trusted from client input.
2. Every repository query includes `organizationId` in the `where` clause.
3. `teacherId` alone is never trusted — always verified against `organizationId`.
4. Branch ownership: `findBranchById(organizationId, branchId)` must return non-null before assignment.
5. Subject ownership: verified by joining `subject → courseLevel → course → organizationId`.

## Validation Rules

- `firstName` and `lastName`: minimum 2 characters, maximum 100.
- `email`: valid email format or empty string.
- `idNumber`: unique per organization (excludes self on update).
- `licenseNumber`: unique per organization (excludes self on update).
- `branchId`: must belong to the active organization.
- `subjectId` (assign): must belong to the active organization's course hierarchy.
- Duplicate subject assignment is blocked by a unique constraint and pre-checked in the command.
- Suspended or inactive teachers cannot be assigned subjects.

## Repository Functions

| Function | Description |
|----------|-------------|
| `findManyByOrganization(orgId, params)` | Paginated list with search/status/branch filters |
| `findByIdInOrganization(id, orgId)` | Single teacher, scoped to org |
| `findByIdWithSubjects(id, orgId)` | Teacher with full subject list (course hierarchy) |
| `createTeacher(data)` | Insert new teacher, status = ACTIVE |
| `updateTeacher(id, data)` | Update fields |
| `suspendTeacher(id, updatedBy)` | Set status = SUSPENDED |
| `softDeleteTeacher(id, updatedBy)` | Set deletedAt = now() |
| `countByStatus(orgId)` | Map of status → count for stats |
| `findTeacherByIdNumber(orgId, idNumber, excludeId?)` | Duplicate check |
| `findTeacherByLicenseNumber(orgId, licenseNumber, excludeId?)` | Duplicate check |
| `listActiveBranches(orgId)` | Active branches for form selects |
| `assignSubject(teacherId, subjectId)` | Create TeacherSubject record |
| `removeSubject(teacherId, subjectId)` | Delete TeacherSubject record |
| `findSubjectsByTeacher(teacherId)` | All subjects with course info |
| `isSubjectAlreadyAssigned(teacherId, subjectId)` | Uniqueness check |
| `findSubjectInOrganization(subjectId, orgId)` | Cross-org subject guard |

## Future Integration Points

| Module | Integration |
|--------|-------------|
| **Class Groups** | Teacher will be assignable to `ClassGroup.teacherId`; detail page shows grouped list |
| **Practical Lessons** | Teacher referenced in `PracticalLesson.teacherId`; detail page shows scheduled/completed lessons |
| **Attendance** | Teacher is the marker (`AttendanceRecord.markedBy`); summary visible on detail page |
| **Courses** | Subjects are linked via `CourseLevel → Course`; subject assignment becomes fully functional once courses are created |
| **Reports** | Teacher activity, lesson hours, and attendance marking rates |
