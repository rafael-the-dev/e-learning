# Courses Management Module

## Scope

Allows ORG_ADMIN and SECRETARY roles to manage **Courses**, **Course Levels**, and **Subjects** within the active organization.

Out of scope (future modules): Enrollments, Payments, Class Groups, Attendance, Online Learning, AI.

---

## Routes

| Route | Permission | Description |
|---|---|---|
| `/courses` | `courses.read` | List all courses with search/filter |
| `/courses/new` | `courses.create` | Create a new course |
| `/courses/[courseId]` | `courses.read` | Course detail with levels and subjects |
| `/courses/[courseId]/edit` | `courses.update` | Edit course |
| `/courses/[courseId]/levels` | `courses.read` | Standalone levels management page |
| `/courses/[courseId]/subjects` | `courses.read` | Standalone subjects management page |

---

## Permissions

| Key | Value | Default roles |
|---|---|---|
| `COURSES_READ` | `courses.read` | ORG_ADMIN, SECRETARY, TEACHER, STUDENT |
| `COURSES_CREATE` | `courses.create` | ORG_ADMIN, SECRETARY |
| `COURSES_UPDATE` | `courses.update` | ORG_ADMIN, SECRETARY |
| `COURSES_ARCHIVE` | `courses.archive` | ORG_ADMIN, SECRETARY |
| `COURSES_DELETE` | `courses.delete` | ORG_ADMIN |
| `COURSE_LEVELS_CREATE` | `course_levels.create` | ORG_ADMIN, SECRETARY |
| `COURSE_LEVELS_UPDATE` | `course_levels.update` | ORG_ADMIN, SECRETARY |
| `COURSE_LEVELS_DELETE` | `course_levels.delete` | ORG_ADMIN, SECRETARY |
| `SUBJECTS_CREATE` | `subjects.create` | ORG_ADMIN, SECRETARY |
| `SUBJECTS_UPDATE` | `subjects.update` | ORG_ADMIN, SECRETARY |
| `SUBJECTS_DELETE` | `subjects.delete` | ORG_ADMIN, SECRETARY |

---

## Commands

### Course Commands

| Command | Permission | Description |
|---|---|---|
| `CreateCourseCommand` | `courses.create` | Validates name/code uniqueness, creates course |
| `UpdateCourseCommand` | `courses.update` | Validates ownership + uniqueness, updates course |
| `ArchiveCourseCommand` | `courses.archive` | Sets status=ARCHIVED |
| `SoftDeleteCourseCommand` | `courses.delete` | Sets deletedAt; blocks if active or has enrollments |

### Course Level Commands

| Command | Permission | Description |
|---|---|---|
| `CreateCourseLevelCommand` | `course_levels.create` | Validates course ownership, creates level |
| `UpdateCourseLevelCommand` | `course_levels.update` | Validates level in org, updates level |
| `ArchiveCourseLevelCommand` | `course_levels.delete` | Sets status=ARCHIVED |
| `DeleteCourseLevelCommand` | `course_levels.delete` | Hard delete; blocks if active subjects exist |

### Subject Commands

| Command | Permission | Description |
|---|---|---|
| `CreateSubjectCommand` | `subjects.create` | Validates course+level ownership, creates subject |
| `UpdateSubjectCommand` | `subjects.update` | Validates subject in org, updates subject |
| `ArchiveSubjectCommand` | `subjects.delete` | Sets status=ARCHIVED |
| `DeleteSubjectCommand` | `subjects.delete` | Hard delete; blocks if assigned to teachers |

---

## Tenant Isolation Rules

- `organizationId` is **always** derived server-side via `requireOrganization()`.
- **Never** accept `organizationId` from client input.
- `Course` queries always include `WHERE organizationId = :activeOrgId`.
- `CourseLevel` does not have a direct `organizationId` column — always scope via `course.organizationId`.
- `Subject` does not have a direct `organizationId` column — always scope via `courseLevel.course.organizationId`.
- All commands verify entity ownership before mutating.

---

## Domain Model

### Course

| Field | Type | Notes |
|---|---|---|
| `id` | `String` | CUID |
| `organizationId` | `String` | Tenant key |
| `name` | `String` | Required, unique within org |
| `code` | `String?` | Optional, unique within org if set |
| `description` | `String?` | Long text |
| `category` | `String?` | `DRIVING \| MOTORCYCLES \| HEAVY_VEHICLES \| PROFESSIONAL \| OTHER` |
| `totalHours` | `Int?` | Total workload hours |
| `price` | `Decimal?` | Base price |
| `status` | `String` | `DRAFT \| ACTIVE \| INACTIVE \| ARCHIVED` |
| `createdAt` / `updatedAt` | `DateTime` | — |
| `deletedAt` | `DateTime?` | Soft delete |

### CourseLevel

| Field | Type | Notes |
|---|---|---|
| `id` | `String` | CUID |
| `courseId` | `String` | FK → Course |
| `name` | `String` | Required |
| `code` | `String?` | Optional |
| `description` | `String?` | — |
| `order` | `Int` | Sort order (0-based, auto-incremented) |
| `totalHours` | `Int?` | — |
| `status` | `String` | `ACTIVE \| INACTIVE \| ARCHIVED` |

### Subject

| Field | Type | Notes |
|---|---|---|
| `id` | `String` | CUID |
| `courseLevelId` | `String` | FK → CourseLevel |
| `name` | `String` | Required |
| `code` | `String?` | Optional |
| `description` | `String?` | — |
| `hoursRequired` | `Int?` | Workload hours for this subject |
| `order` | `Int` | Sort order (0-based, auto-incremented) |
| `status` | `String` | `ACTIVE \| INACTIVE \| ARCHIVED` |

---

## Validation Rules

### Course
- `name`: required, min 2, max 200 chars; unique within org
- `code`: optional, max 50 chars; unique within org if provided
- `status`: `DRAFT | ACTIVE | INACTIVE | ARCHIVED`
- Cannot delete an ACTIVE course
- Cannot delete a course with enrollments

### CourseLevel
- `name`: required, min 2, max 200 chars
- `order`: auto-assigned if omitted (last + 1)
- Cannot delete a level with active (non-ARCHIVED) subjects

### Subject
- `name`: required, min 2, max 200 chars
- `courseLevelId` must belong to the specified `courseId`
- `order`: auto-assigned if omitted (last + 1)
- Cannot delete a subject assigned to teachers

---

## Audit Events

| Event | Entity | Trigger |
|---|---|---|
| `course.created` | `Course` | CreateCourseCommand |
| `course.updated` | `Course` | UpdateCourseCommand |
| `course.archived` | `Course` | ArchiveCourseCommand |
| `course.deleted` | `Course` | SoftDeleteCourseCommand |
| `course_level.created` | `CourseLevel` | CreateCourseLevelCommand |
| `course_level.updated` | `CourseLevel` | UpdateCourseLevelCommand |
| `course_level.archived` | `CourseLevel` | ArchiveCourseLevelCommand |
| `course_level.deleted` | `CourseLevel` | DeleteCourseLevelCommand |
| `subject.created` | `Subject` | CreateSubjectCommand |
| `subject.updated` | `Subject` | UpdateSubjectCommand |
| `subject.archived` | `Subject` | ArchiveSubjectCommand |
| `subject.deleted` | `Subject` | DeleteSubjectCommand |

---

## Status Transitions

```
Course:      DRAFT → ACTIVE → INACTIVE → ARCHIVED
                          ↕
                       DRAFT (via edit)

CourseLevel: ACTIVE ↔ INACTIVE → ARCHIVED

Subject:     ACTIVE ↔ INACTIVE → ARCHIVED
```

---

## Future Integration Points

### Enrollments (Module 8)
- `Enrollment` has FK `courseId` and `courseLevelId`
- A course with enrollments **cannot** be hard-deleted
- Course detail page shows placeholder: "Módulo de matrículas em desenvolvimento"

### Class Groups (Module 10)
- `ClassGroup` has FK `courseId` and `courseLevelId`
- Course detail page shows placeholder: "Módulo de turmas em desenvolvimento"

### Online Learning (Future)
- Subjects will have online content units
- Course detail page shows placeholder: "Módulo de aprendizagem online em desenvolvimento"

### AI Features (Future)
- AI-generated course content, quizzes, recommendations
- Course detail page shows placeholder: "Avaliações em desenvolvimento"

---

## Module File Structure

```
src/modules/courses/
  types/index.ts                — Course, CourseLevel, Subject interfaces + label maps
  schemas/
    course.schema.ts            — Zod schemas for course CRUD
    level.schema.ts             — Zod schemas for level CRUD
    subject.schema.ts           — Zod schemas for subject CRUD
  repositories/
    course.repository.ts        — All DB queries for courses
    level.repository.ts         — All DB queries for levels
    subject.repository.ts       — All DB queries for subjects
  services/course.service.ts    — Read-only service wrappers
  commands/
    create-course.command.ts
    update-course.command.ts
    archive-course.command.ts
    delete-course.command.ts
    create-level.command.ts
    update-level.command.ts
    archive-level.command.ts
    delete-level.command.ts
    create-subject.command.ts
    update-subject.command.ts
    archive-subject.command.ts
    delete-subject.command.ts
  actions/
    course.actions.ts           — Server actions for courses
    level.actions.ts            — Server actions for levels
    subject.actions.ts          — Server actions for subjects
  components/
    course-columns.tsx          — TanStack Table column defs
    courses-table.tsx           — Client table with filters + confirm dialogs
    course-form.tsx             — Create + Edit forms
    course-detail-actions.tsx   — Archive/Delete dropdown for detail page
    level-form.tsx              — Create + Edit drawers (Sheet)
    levels-table.tsx            — Inline levels list with actions
    subject-form.tsx            — Create + Edit drawers (Sheet)
    subjects-table.tsx          — Inline subjects list with actions

src/app/(org)/courses/
  page.tsx                      — List page
  new/page.tsx                  — Create page
  [courseId]/page.tsx           — Detail page
  [courseId]/edit/page.tsx      — Edit page
  [courseId]/levels/page.tsx    — Standalone levels page
  [courseId]/subjects/page.tsx  — Standalone subjects page
```
