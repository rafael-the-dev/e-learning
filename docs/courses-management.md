# Courses Management Module

## Scope

Allows ORG_ADMIN and SECRETARY roles to manage **Course Categories**, **Courses**, **Course Levels**, and **Subjects** within the active organization.

Course categories are tenant-managed entities. There are no hardcoded category values. Each organization defines its own categories (e.g. "Informática", "Idiomas", "Saúde", "Condução", etc.).

Out of scope (future modules): Enrollments, Payments, Class Groups, Attendance, Online Learning, AI.

---

## Routes

| Route | Permission | Description |
|---|---|---|
| `/courses` | `courses.read` | List all courses with search/filter |
| `/courses/new` | `courses.create` | Create a new course |
| `/courses/categories` | `course_categories.view` | Manage course categories |
| `/courses/[courseId]` | `courses.read` | Course detail with levels and subjects |
| `/courses/[courseId]/edit` | `courses.update` | Edit course |
| `/courses/[courseId]/levels` | `courses.read` | Standalone levels management page |
| `/courses/[courseId]/subjects` | `courses.read` | Standalone subjects management page |

---

## Permissions

### Course Permissions

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

### Course Category Permissions

| Key | Value | Default roles |
|---|---|---|
| `COURSE_CATEGORIES_VIEW` | `course_categories.view` | ORG_ADMIN, SECRETARY |
| `COURSE_CATEGORIES_CREATE` | `course_categories.create` | ORG_ADMIN |
| `COURSE_CATEGORIES_UPDATE` | `course_categories.update` | ORG_ADMIN |
| `COURSE_CATEGORIES_ARCHIVE` | `course_categories.archive` | ORG_ADMIN |
| `COURSE_CATEGORIES_DELETE` | `course_categories.delete` | ORG_ADMIN |

SECRETARY can view and select categories when creating/editing courses, but cannot create, update, archive, or delete them.

---

## Commands

### Course Category Commands

| Command | Permission | Description |
|---|---|---|
| `CreateCourseCategoryCommand` | `course_categories.create` | Validates name uniqueness within org, creates category |
| `UpdateCourseCategoryCommand` | `course_categories.update` | Validates ownership + name uniqueness, updates category |
| `ArchiveCourseCategoryCommand` | `course_categories.archive` | Sets status=ARCHIVED; blocks if already archived |
| `SoftDeleteCourseCategoryCommand` | `course_categories.delete` | Sets deletedAt; blocks if courses are using the category |

### Course Commands

| Command | Permission | Description |
|---|---|---|
| `CreateCourseCommand` | `courses.create` | Validates name/code uniqueness + optional categoryId ownership, creates course |
| `UpdateCourseCommand` | `courses.update` | Validates ownership + uniqueness + optional categoryId ownership, updates course |
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
- `CourseCategory` queries always include `WHERE organizationId = :activeOrgId AND deletedAt IS NULL`.
- `CourseLevel` does not have a direct `organizationId` column — always scope via `course.organizationId`.
- `Subject` does not have a direct `organizationId` column — always scope via `courseLevel.course.organizationId`.
- When assigning `categoryId` to a course, the command verifies the category belongs to `activeOrganizationId` before saving.
- All commands verify entity ownership before mutating.

---

## Domain Model

### CourseCategory

| Field | Type | Notes |
|---|---|---|
| `id` | `String` | CUID |
| `organizationId` | `String` | Tenant key |
| `name` | `String` | Required, unique within org (enforced by `@@unique([organizationId, name])`) |
| `description` | `String?` | Optional |
| `status` | `String` | `ACTIVE \| INACTIVE \| ARCHIVED` |
| `createdAt` / `updatedAt` | `DateTime` | — |
| `deletedAt` | `DateTime?` | Soft delete |
| `createdBy` / `updatedBy` | `String?` | User ID |

### Course

| Field | Type | Notes |
|---|---|---|
| `id` | `String` | CUID |
| `organizationId` | `String` | Tenant key |
| `categoryId` | `String?` | FK → CourseCategory (nullable, tenant-verified) |
| `name` | `String` | Required, unique within org |
| `code` | `String?` | Optional, unique within org if set |
| `description` | `String?` | Long text |
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
| `order` | `Int` | Sort order (0-based) |
| `totalHours` | `Int?` | — |
| `status` | `String` | `ACTIVE \| INACTIVE \| ARCHIVED` |

### Subject

| Field | Type | Notes |
|---|---|---|
| `id` | `String` | CUID |
| `courseLevelId` | `String` | FK → CourseLevel |
| `name` | `String` | Required |
| `code` | `String?` | Optional |
| `hoursRequired` | `Int?` | Workload hours |
| `order` | `Int` | Sort order (0-based) |
| `status` | `String` | `ACTIVE \| INACTIVE \| ARCHIVED` |

---

## Course Category Assignment Rules

1. `categoryId` is optional. A course can exist without a category.
2. When `categoryId` is provided, the command verifies the category exists in `activeOrganizationId`.
3. A category ID from a different organization is rejected as `ValidationError`.
4. Deleting a category that has active courses is blocked by `SoftDeleteCourseCategoryCommand`.
5. Archiving a category does **not** block courses from referencing it — existing courses retain the reference, but the category will not appear in the "active categories" dropdown for new courses.
6. The course form loads only `ACTIVE` categories for selection.
7. The course list and detail always display the category name (resolved server-side via JOIN).

---

## Validation Rules

### CourseCategory
- `name`: required, min 2, max 200 chars; unique within org
- `status`: `ACTIVE | INACTIVE | ARCHIVED`
- Cannot delete if courses are using the category

### Course
- `name`: required, min 2, max 200 chars; unique within org
- `code`: optional, max 50 chars; unique within org if provided
- `categoryId`: optional; if provided, must belong to `activeOrganizationId`
- `status`: `DRAFT | ACTIVE | INACTIVE | ARCHIVED`
- Cannot delete an ACTIVE course
- Cannot delete a course with enrollments

### CourseLevel
- `name`: required, min 2, max 200 chars
- Cannot delete a level with active (non-ARCHIVED) subjects

### Subject
- `name`: required, min 2, max 200 chars
- `courseLevelId` must belong to the specified `courseId`
- Cannot delete a subject assigned to teachers

---

## Audit Events

| Event | Entity | Trigger |
|---|---|---|
| `course_category.created` | `CourseCategory` | CreateCourseCategoryCommand |
| `course_category.updated` | `CourseCategory` | UpdateCourseCategoryCommand |
| `course_category.archived` | `CourseCategory` | ArchiveCourseCategoryCommand |
| `course_category.deleted` | `CourseCategory` | SoftDeleteCourseCategoryCommand |
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
CourseCategory: ACTIVE ↔ INACTIVE → ARCHIVED

Course:      DRAFT → ACTIVE → INACTIVE → ARCHIVED
                          ↕
                       DRAFT (via edit)

CourseLevel: ACTIVE ↔ INACTIVE → ARCHIVED

Subject:     ACTIVE ↔ INACTIVE → ARCHIVED
```

---

## Migration Note: Static → Tenant-Managed Categories

The original implementation used a static `category String?` field on `Course` with hardcoded values (`DRIVING`, `MOTORCYCLES`, `HEAVY_VEHICLES`, `PROFESSIONAL`, `OTHER`). This was replaced with a tenant-managed `CourseCategory` entity and a `categoryId String?` FK on `Course`.

If production data existed with the old `category` field:
1. Create `CourseCategory` records from the distinct category values found in `course.category`.
2. For each `Course`, set `categoryId` to the matching `CourseCategory.id`.
3. Remove the `category` column from the schema (already done).

No seed data is provided for categories — each organization creates its own.

---

## Future Integration Points

### Enrollments (Module 8)
- `Enrollment` has FK `courseId` and `courseLevelId`
- A course with enrollments **cannot** be hard-deleted

### Class Groups (Module 10)
- `ClassGroup` has FK `courseId` and `courseLevelId`

### Online Learning (Future)
- Subjects will have online content units

### AI Features (Future)
- AI-generated course content, quizzes, recommendations

---

## Module File Structure

```
src/modules/courses/
  types/index.ts                     — CourseCategory, Course, CourseLevel, Subject + label maps
  schemas/
    category.schema.ts               — Zod schemas for course category CRUD
    course.schema.ts                 — Zod schemas for course CRUD
    level.schema.ts                  — Zod schemas for level CRUD
    subject.schema.ts                — Zod schemas for subject CRUD
  repositories/
    category.repository.ts           — All DB queries for course categories
    course.repository.ts             — All DB queries for courses
    level.repository.ts              — All DB queries for levels
    subject.repository.ts            — All DB queries for subjects
  services/course.service.ts         — Read-only service wrappers (courses + categories)
  commands/
    create-category.command.ts
    update-category.command.ts
    archive-category.command.ts
    delete-category.command.ts
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
    category.actions.ts              — Server actions for course categories
    course.actions.ts                — Server actions for courses
    level.actions.ts                 — Server actions for levels
    subject.actions.ts               — Server actions for subjects
  components/
    categories-page-client.tsx       — Client wrapper with create drawer state
    category-columns.tsx             — TanStack Table column defs for categories
    categories-table.tsx             — Client table with filters + confirm dialogs
    category-form.tsx                — Create + Edit drawers (Sheet)
    course-columns.tsx               — TanStack Table column defs for courses
    courses-table.tsx                — Client table with dynamic category filter
    course-form.tsx                  — Create + Edit forms (uses dynamic categories)
    course-detail-actions.tsx        — Archive/Delete dropdown for course detail
    level-form.tsx                   — Create + Edit drawers (Sheet)
    levels-table.tsx                 — Inline levels list with actions
    subject-form.tsx                 — Create + Edit drawers (Sheet)
    subjects-table.tsx               — Inline subjects list with actions

src/app/(org)/courses/
  page.tsx                           — List page (loads active categories for filter)
  new/page.tsx                       — Create page (loads active categories for form)
  categories/page.tsx                — Category management page
  [courseId]/page.tsx                — Detail page (shows categoryName via JOIN)
  [courseId]/edit/page.tsx           — Edit page (loads active categories for form)
  [courseId]/levels/page.tsx         — Standalone levels page
  [courseId]/subjects/page.tsx       — Standalone subjects page
```
