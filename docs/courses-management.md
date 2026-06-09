# Courses Management Module

## Scope

Allows ORG_ADMIN and SECRETARY roles to manage **Course Categories**, **Courses**, **Course Levels**, **Subjects**, and **Level Subjects** within the active organization.

Course categories are tenant-managed entities. There are no hardcoded category values. Each organization defines its own categories (e.g. "Informática", "Idiomas", "Saúde", "Condução", etc.).

Out of scope (future modules): Enrollments, Payments, Class Groups, Attendance, Online Learning, AI.

---

## Domain Model

### Subject (global, org-scoped)

A `Subject` is a **global entity** within the organization. It is not tied to any specific course or level. The same subject can be used in multiple courses and multiple levels.

| Field | Type | Notes |
|---|---|---|
| `id` | `String` | CUID |
| `organizationId` | `String` | Tenant key — always comes from server |
| `name` | `String` | Required, min 2, max 200 chars |
| `code` | `String?` | Optional; unique within org if set |
| `description` | `String?` | Long text |
| `status` | `String` | `ACTIVE \| INACTIVE \| ARCHIVED` |
| `createdAt` / `updatedAt` | `DateTime` | — |
| `deletedAt` | `DateTime?` | Soft delete |

**Important**: `minimumPassingGrade` and `workloadHours` do NOT belong to Subject. They belong to `LevelSubject` because they vary per level.

### LevelSubject (academic rule engine)

`LevelSubject` is the **academic rule engine** for a subject within a course level. It holds all context-specific rules that determine how a subject is taught and evaluated in a particular level. The same `Subject` (e.g. "Código da Estrada") can appear in multiple levels with completely different rules.

#### Identity

| Field | Type | Notes |
|---|---|---|
| `id` | `String` | CUID |
| `organizationId` | `String` | Tenant key — always server-side |
| `courseId` | `String` | FK → Course (for fast joins) |
| `courseLevelId` | `String` | FK → CourseLevel |
| `subjectId` | `String` | FK → Subject |
| `order` | `Int` | Sort position within the level (0-based, unique per level) |
| `status` | `String` | `ACTIVE \| INACTIVE \| ARCHIVED` |
| `createdAt` / `updatedAt` | `DateTime` | — |
| `deletedAt` | `DateTime?` | Soft delete |

#### Workload

| Field | Type | Default | Notes |
|---|---|---|---|
| `workloadHours` | `Int?` | — | Total hours allocated. Must be > 0 if provided |
| `theoryHours` | `Int?` | — | Theory hours component. Must be ≥ 0 |
| `practicalHours` | `Int?` | — | Practical hours component. Must be ≥ 0 |

**Rule:** `theoryHours + practicalHours` must not exceed `workloadHours` when both are provided.

#### Academic Thresholds

| Field | Type | Default | Notes |
|---|---|---|---|
| `minimumPassingGrade` | `Decimal?` | — | 0–100; controls academic approval |
| `minimumAttendancePercentage` | `Decimal?` | — | 0–100; controls attendance eligibility |
| `maxAbsences` | `Int?` | — | Maximum allowed absences (≥ 0) |

#### Behavioural Flags

| Field | Type | Default | Notes |
|---|---|---|---|
| `isRequired` | `Boolean` | `true` | Subject is mandatory in this level |
| `allowRetakeExam` | `Boolean` | `true` | Student may sit a retake exam if failed |
| `allowCompensation` | `Boolean` | `false` | Grade compensation by other subjects is allowed |
| `certificateRequired` | `Boolean` | `false` | Subject must be completed before certificate issuance |

**Constraints:**
- `@@unique([courseLevelId, subjectId])` — same subject cannot be linked twice to the same level
- `order` must be unique within the same `courseLevelId` (enforced in commands)
- `workloadHours` must be > 0 if provided
- `minimumPassingGrade` must be between 0 and 100
- `minimumAttendancePercentage` must be between 0 and 100
- `maxAbsences` must be ≥ 0 when provided
- `theoryHours + practicalHours` must not exceed `workloadHours`

**Future modules that depend on LevelSubject:**
- **Attendance** — uses `minimumAttendancePercentage` and `maxAbsences` to determine attendance eligibility
- **Assessments** — uses `minimumPassingGrade` to determine pass/fail; `allowRetakeExam` to gate retakes
- **Progression** — uses `isRequired` and `allowCompensation` for level completion logic
- **Certificates** — uses `certificateRequired` to gate certificate issuance

### CourseLevel

| Field | Type | Notes |
|---|---|---|
| `id` | `String` | CUID |
| `courseId` | `String` | FK → Course |
| `name` | `String` | Required; unique within course |
| `code` | `String?` | Optional shortcode |
| `description` | `String?` | Optional |
| `order` | `Int` | Sort order (0-based, auto-assigned on create) |
| `totalHours` | `Int?` | Workload hours |
| `isActive` | `Boolean` | Derived from status; kept in sync on every write |
| `status` | `String` | `ACTIVE \| INACTIVE \| ARCHIVED` |
| `createdAt` / `updatedAt` | `DateTime` | — |

No direct `organizationId` column. Tenant scope is enforced via `course.organizationId` on every query.

---

## Routes

| Route | Permission | Description |
|---|---|---|
| `/subjects` | `subjects.view` | Global subjects list with search/filter |
| `/courses` | `courses.read` | List all courses |
| `/courses/new` | `courses.create` | Create a new course |
| `/courses/categories` | `course_categories.view` | Manage course categories |
| `/courses/[courseId]` | `courses.read` | Course detail with levels |
| `/courses/[courseId]/edit` | `courses.update` | Edit course |
| `/courses/[courseId]/levels` | `courses.read` | Levels management |
| `/courses/[courseId]/levels/[levelId]` | `course_levels.view` | Level detail with subject assignments |

---

## Permissions

### Subject Permissions

| Key | Value | Default roles |
|---|---|---|
| `SUBJECTS_VIEW` | `subjects.view` | ORG_ADMIN, SECRETARY |
| `SUBJECTS_CREATE` | `subjects.create` | ORG_ADMIN only |
| `SUBJECTS_UPDATE` | `subjects.update` | ORG_ADMIN only |
| `SUBJECTS_ARCHIVE` | `subjects.archive` | ORG_ADMIN only |
| `SUBJECTS_DELETE` | `subjects.delete` | ORG_ADMIN only |

SECRETARY can **view** subjects but **cannot** create, update, archive, or delete them.

### Level Subject Permissions

| Key | Value | Default roles |
|---|---|---|
| `LEVEL_SUBJECTS_VIEW` | `level_subjects.view` | ORG_ADMIN, SECRETARY |
| `LEVEL_SUBJECTS_ASSIGN` | `level_subjects.assign` | ORG_ADMIN only |
| `LEVEL_SUBJECTS_UPDATE` | `level_subjects.update` | ORG_ADMIN only |
| `LEVEL_SUBJECTS_REMOVE` | `level_subjects.remove` | ORG_ADMIN only |
| `LEVEL_SUBJECTS_REORDER` | `level_subjects.reorder` | ORG_ADMIN only |

SECRETARY can **view** level subjects but cannot assign, update, remove, or reorder them.

### Course Level Permissions

| Key | Value | Default roles |
|---|---|---|
| `COURSE_LEVELS_VIEW` | `course_levels.view` | ORG_ADMIN, SECRETARY |
| `COURSE_LEVELS_CREATE` | `course_levels.create` | ORG_ADMIN only |
| `COURSE_LEVELS_UPDATE` | `course_levels.update` | ORG_ADMIN only |
| `COURSE_LEVELS_ARCHIVE` | `course_levels.archive` | ORG_ADMIN only |
| `COURSE_LEVELS_DELETE` | `course_levels.delete` | ORG_ADMIN only |
| `COURSE_LEVELS_REORDER` | `course_levels.reorder` | ORG_ADMIN only |

### Course Category Permissions

| Key | Value | Default roles |
|---|---|---|
| `COURSE_CATEGORIES_VIEW` | `course_categories.view` | ORG_ADMIN, SECRETARY |
| `COURSE_CATEGORIES_CREATE` | `course_categories.create` | ORG_ADMIN |
| `COURSE_CATEGORIES_UPDATE` | `course_categories.update` | ORG_ADMIN |
| `COURSE_CATEGORIES_ARCHIVE` | `course_categories.archive` | ORG_ADMIN |
| `COURSE_CATEGORIES_DELETE` | `course_categories.delete` | ORG_ADMIN |

---

## Commands

### Subject Commands

| Command | Permission | Description |
|---|---|---|
| `CreateSubjectCommand` | `subjects.create` | Validates code uniqueness within org, creates org-scoped Subject |
| `UpdateSubjectCommand` | `subjects.update` | Validates ownership + code uniqueness, updates Subject |
| `ArchiveSubjectCommand` | `subjects.archive` | Sets status=ARCHIVED; blocks if already archived |
| `SoftDeleteSubjectCommand` | `subjects.delete` | Sets deletedAt; blocks if assigned to teachers or levels |

### Level Subject Commands

| Command | Permission | Description |
|---|---|---|
| `AssignSubjectToLevelCommand` | `level_subjects.assign` | Validates course+level+subject ownership, checks no duplicate link, checks order uniqueness, creates LevelSubject |
| `UpdateLevelSubjectCommand` | `level_subjects.update` | Validates LevelSubject in org, checks order uniqueness, updates contextual rules |
| `RemoveSubjectFromLevelCommand` | `level_subjects.remove` | Validates LevelSubject in org, soft-deletes |
| `ReorderLevelSubjectsCommand` | `level_subjects.reorder` | Validates all IDs belong to level+org, reorders in transaction |

### Course Level Commands

| Command | Permission | Description |
|---|---|---|
| `CreateCourseLevelCommand` | `course_levels.create` | Validates course ownership + duplicate name, auto-assigns order |
| `UpdateCourseLevelCommand` | `course_levels.update` | Validates level ownership + duplicate name |
| `ArchiveCourseLevelCommand` | `course_levels.archive` | Sets status=ARCHIVED; blocks if already archived |
| `DeleteCourseLevelCommand` | `course_levels.delete` | Hard delete; blocks if active LevelSubjects exist |
| `ReorderCourseLevelsCommand` | `course_levels.reorder` | Validates all level IDs belong to course+org |

---

## Tenant Isolation Rules

- `organizationId` is **always** derived server-side via `requireOrganization()` — never from client input.
- `Subject` queries always include `WHERE organizationId = :activeOrgId AND deletedAt IS NULL`.
- `LevelSubject` queries always include `WHERE organizationId = :activeOrgId AND deletedAt IS NULL`.
- `CourseLevel` does not have a direct `organizationId` — always scope via `course.organizationId`.
- `courseId`, `courseLevelId`, and `subjectId` in LevelSubject commands are always validated against `activeOrganizationId`.

---

## Validation Rules

### Subject
- `name`: required, min 2, max 200 chars
- `code`: optional, max 50 chars; unique within org if provided (case-sensitive)
- Cannot delete if assigned to teachers (`teacherSubjects`) or levels (`levelSubjects`)

### LevelSubject
- `subjectId`: must belong to `activeOrganizationId`
- `courseLevelId`: must belong to the specified `courseId` and `activeOrganizationId`
- `order`: must be unique within the same `courseLevelId` (enforced in command)
- Same subject cannot be linked twice to the same level (`@@unique([courseLevelId, subjectId])`)
- `workloadHours`: optional; if provided, must be > 0
- `theoryHours`: optional; must be ≥ 0; `theoryHours + practicalHours` must not exceed `workloadHours`
- `practicalHours`: optional; must be ≥ 0
- `minimumPassingGrade`: optional; if provided, must be between 0 and 100
- `minimumAttendancePercentage`: optional; if provided, must be between 0 and 100
- `maxAbsences`: optional; must be ≥ 0
- Boolean defaults: `isRequired=true`, `allowRetakeExam=true`, `allowCompensation=false`, `certificateRequired=false`

### CourseLevel
- `name`: required, min 2, max 200 chars; unique within the same course
- `code`: optional, max 50 chars
- Cannot delete a level with active (non-ARCHIVED) LevelSubjects

---

## Audit Events

| Event | Entity | Trigger |
|---|---|---|
| `subject.created` | `Subject` | CreateSubjectCommand |
| `subject.updated` | `Subject` | UpdateSubjectCommand |
| `subject.archived` | `Subject` | ArchiveSubjectCommand |
| `subject.deleted` | `Subject` | SoftDeleteSubjectCommand |
| `level_subject.assigned` | `LevelSubject` | AssignSubjectToLevelCommand |
| `level_subject.updated` | `LevelSubject` | UpdateLevelSubjectCommand |
| `level_subject.removed` | `LevelSubject` | RemoveSubjectFromLevelCommand |
| `level_subject.reordered` | `LevelSubject` | ReorderLevelSubjectsCommand |
| `course_level.created` | `CourseLevel` | CreateCourseLevelCommand |
| `course_level.updated` | `CourseLevel` | UpdateCourseLevelCommand |
| `course_level.archived` | `CourseLevel` | ArchiveCourseLevelCommand |
| `course_level.deleted` | `CourseLevel` | DeleteCourseLevelCommand |
| `course_level.reordered` | `CourseLevel` | ReorderCourseLevelsCommand |

---

## Status Transitions

```
Subject:      ACTIVE ↔ INACTIVE → ARCHIVED

LevelSubject: ACTIVE ↔ INACTIVE → ARCHIVED

CourseLevel:  ACTIVE ↔ INACTIVE → ARCHIVED

Course:       DRAFT → ACTIVE → INACTIVE → ARCHIVED
```

---

## Module File Structure

```
src/modules/courses/
  types/index.ts                      — CourseCategory, Course, CourseLevel, Subject, LevelSubject + label maps
  schemas/
    category.schema.ts                — Zod schemas for course category CRUD
    course.schema.ts                  — Zod schemas for course CRUD
    level.schema.ts                   — Zod schemas for level CRUD
    subject.schema.ts                 — Zod schemas for Subject CRUD (org-level)
    level-subject.schema.ts           — Zod schemas for LevelSubject CRUD
  repositories/
    category.repository.ts            — All DB queries for course categories
    course.repository.ts              — All DB queries for courses
    level.repository.ts               — All DB queries for levels
    subject.repository.ts             — All DB queries for Subjects (org-scoped via organizationId)
    level-subject.repository.ts       — All DB queries for LevelSubjects
  services/course.service.ts          — Read-only service wrappers
  commands/
    create-subject.command.ts         — org-scoped; validates code uniqueness
    update-subject.command.ts         — validates ownership + code uniqueness
    archive-subject.command.ts        — uses subjects.archive permission
    delete-subject.command.ts         — soft delete; blocks if has level/teacher assignments
    assign-subject-to-level.command.ts
    update-level-subject.command.ts
    remove-subject-from-level.command.ts
    reorder-level-subjects.command.ts
    create-level.command.ts
    update-level.command.ts
    archive-level.command.ts
    delete-level.command.ts           — blocks if active LevelSubjects exist
    reorder-levels.command.ts
    ...
  actions/
    subject.actions.ts                — createSubjectAction, updateSubjectAction, archiveSubjectAction, softDeleteSubjectAction
    level-subject.actions.ts          — assignSubjectToLevelAction, updateLevelSubjectAction, removeSubjectFromLevelAction, reorderLevelSubjectsAction
    level.actions.ts
    course.actions.ts
    category.actions.ts
  components/
    subject-form.tsx                  — CreateSubjectDrawer, EditSubjectDrawer (org-level, no level picker)
    subjects-table.tsx                — Global subjects list with search + status filter
    level-subject-form.tsx            — AssignSubjectDrawer, EditLevelSubjectDrawer
    level-subjects-panel.tsx          — Panel for level detail page
    levels-table.tsx
    level-form.tsx
    ...

src/app/(org)/
  subjects/page.tsx                   — Global subjects management page (/subjects)
  courses/
    [courseId]/
      levels/
        [levelId]/page.tsx            — Level detail with subject assignments
        page.tsx                      — Levels list
      page.tsx                        — Course detail (no subjects section; subjects are global)
      subjects/page.tsx               — Redirects to /subjects
```

---

## Migration Note: Subjects Refactor

The original implementation treated `Subject` as belonging directly to a `CourseLevel` (with `courseLevelId` FK on Subject, plus `hoursRequired`, `order`, `isActive` fields). This was replaced with:

1. `Subject` as an org-level entity with direct `organizationId` and soft delete.
2. `LevelSubject` as the junction table holding all contextual rules (workloadHours, minimumPassingGrade, order, isRequired).

This means:
- The same subject can now be reused across multiple courses and levels.
- Each level defines its own rules (hours, passing grade, order) independently.
- Deleting a subject requires removing all level and teacher assignments first.

Migration: `20260604120000_refactor_subjects_architecture`
