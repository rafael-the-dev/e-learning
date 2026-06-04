# Class Groups Management

## Overview

A **ClassGroup** (Turma) represents a cohort of students enrolled in a specific course, optionally at a level, taught by a teacher, and belonging to an org branch.

## Domain Model

```
Organization
  └── ClassGroup
        ├── Course (required)
        ├── CourseLevel (optional)
        ├── Teacher (optional)
        ├── Branch (optional)
        ├── ClassGroupSchedule[] → ScheduleSlot → SchedulePeriod
        └── Enrollment[] (future)
```

## ClassGroup Fields

| Field | Description |
|---|---|
| `id` | CUID primary key |
| `organizationId` | Tenant scope |
| `courseId` | Required link to Course |
| `courseLevelId` | Optional link to CourseLevel |
| `branchId` | Optional link to Branch |
| `teacherId` | Optional link to Teacher |
| `name` | Group display name |
| `code` | Optional unique code within org |
| `capacity` | Maximum enrollment count (default 30) |
| `currentCount` | Current enrollment count |
| `startDate` | Optional start date |
| `endDate` | Optional end date |
| `status` | `FORMING` \| `ACTIVE` \| `COMPLETED` \| `CANCELLED` \| `ARCHIVED` |
| `deletedAt` | Soft delete timestamp |

## Schedule Integration

Class groups do **not** store schedule data directly. They reference reusable ScheduleSlots through `ClassGroupSchedule` (junction table).

See [schedules-management.md](./schedules-management.md) for the full scheduling architecture.

### Assigning Schedules to a Class Group

1. Navigate to the class group detail page (`/class-groups/[id]`).
2. In the Horários section, select a slot from the dropdown.
3. Click **Atribuir**.

Slots are grouped by SchedulePeriod for readability:
```
Manhã:
  Segunda-feira  08:00 — 10:00
  Quarta-feira   08:00 — 10:00
Tarde:
  Sexta-feira    14:00 — 16:00
```

Only `ACTIVE` slots from the same organization are available for assignment. A slot cannot be assigned twice to the same class group.

### Removing Schedule Assignments

In the Horários section of the class group detail page, use the actions menu (⋯) on a slot row and select **Remover**.

### Permissions for Schedule Assignment

| Permission | Who |
|---|---|
| `classGroupSchedules.assign` | ORG_ADMIN, SECRETARY |
| `classGroupSchedules.remove` | ORG_ADMIN, SECRETARY |
| `classGroupSchedules.view` | ORG_ADMIN, SECRETARY, TEACHER |

SECRETARY can assign/remove existing slots but **cannot** create or modify SchedulePeriods or ScheduleSlots.

## Permissions

| Permission | Description |
|---|---|
| `class_groups.create` | Create a new class group |
| `class_groups.read` | View list and detail |
| `class_groups.update` | Edit class group fields |
| `class_groups.archive` | Set status to ARCHIVED |
| `class_groups.delete` | Soft-delete (only if no active enrollments) |

## Status Lifecycle

```
FORMING → ACTIVE → COMPLETED
        ↘ CANCELLED
Any → ARCHIVED (admin action)
```

## Business Rules

1. `code` must be unique within the organization (if provided).
2. `courseLevelId` must belong to the selected `courseId`.
3. `startDate` must be before `endDate`.
4. Cannot delete a class group with active enrollments.
5. Archive is used instead of delete when enrollments exist.
6. `currentCount` is managed by the enrollment module (not directly editable).

## Tenant Isolation

- `organizationId` is never accepted from client input.
- `requireOrganization()` injects the active org from the session.
- All queries filter by `organizationId`.
- Cross-entity references (course, level, branch, teacher, schedule slot) are validated against the same `organizationId`.

## Audit Events

| Event | Trigger |
|---|---|
| `class_group.created` | Group created |
| `class_group.updated` | Group fields changed |
| `class_group.archived` | Status set to ARCHIVED |
| `class_group.deleted` | Group soft-deleted |

## UI Routes

| Route | Description |
|---|---|
| `/class-groups` | List page with filters and stats |
| `/class-groups/new` | Create form |
| `/class-groups/[id]` | Detail page with schedule panel |
| `/class-groups/[id]/edit` | Edit form |
