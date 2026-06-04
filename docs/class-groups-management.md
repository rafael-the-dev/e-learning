# Class Groups Management

## Overview

Class groups represent a cohort of students enrolled in a specific course, optionally in a specific course level. Each class group belongs to an organization (tenant isolation), can be assigned to a branch and a lead teacher, and carries its own schedule of weekly sessions.

## Domain Model

### ClassGroup

| Field | Type | Description |
|---|---|---|
| id | string | CUID primary key |
| organizationId | string | Tenant identifier (from server context only) |
| branchId | string? | Branch the group belongs to |
| courseId | string | Required course |
| courseLevelId | string? | Optional course level |
| teacherId | string? | Lead teacher |
| name | string | Group name (unique per org recommended) |
| code | string? | Short code, unique per organization |
| capacity | number | Maximum number of students (> 0) |
| currentCount | number | Managed by the Enrollments module |
| startDate | Date? | Planned start date |
| endDate | Date? | Planned end date |
| status | string | See Status Values below |
| createdAt / updatedAt | Date | Timestamps |
| deletedAt | Date? | Soft delete marker |

### ClassSchedule

| Field | Type | Description |
|---|---|---|
| id | string | CUID primary key |
| classGroupId | string | Owning class group |
| dayOfWeek | number | 0 = Sunday … 6 = Saturday |
| startTime | string | HH:MM (24h) |
| endTime | string | HH:MM (24h), must be after startTime |
| room | string? | Classroom or location |
| createdAt / updatedAt | Date | Timestamps |

Note: ClassSchedule has no `organizationId` column. Tenant isolation is enforced by joining through `classGroup.organizationId` at the repository layer.

## Status Values

| Value | Label (pt-PT) | Description |
|---|---|---|
| FORMING | Em Formação | Group is being assembled |
| ACTIVE | Ativo | Group is active and running |
| COMPLETED | Concluído | Course completed |
| CANCELLED | Cancelado | Group cancelled |
| ARCHIVED | Arquivado | Archived, no longer visible |

## Permissions Matrix

| Permission | ORG_ADMIN | SECRETARY | TEACHER |
|---|---|---|---|
| class_groups.read | ✓ | ✓ | ✓ |
| class_groups.create | ✓ | ✓ | — |
| class_groups.update | ✓ | ✓ | — |
| class_groups.archive | ✓ | — | — |
| class_groups.delete | ✓ | — | — |
| class_schedules.view | ✓ | ✓ | ✓ |
| class_schedules.create | ✓ | ✓ | — |
| class_schedules.update | ✓ | ✓ | — |
| class_schedules.delete | ✓ | — | — |

## Business Rules

- `code` must be unique within the organization.
- `capacity` must be ≥ 1.
- `startDate` must be before `endDate` when both are provided.
- `courseLevelId` must belong to the selected `courseId`.
- `teacherId` must belong to the active organization.
- `branchId` must belong to the active organization.
- Deleting a class group is blocked if active enrollments exist.

## Tenant Isolation

- `organizationId` is always derived from `requireOrganization()` server-side.
- No client input is trusted for tenant resolution.
- All mutating repository functions include `organizationId` in the `WHERE` clause.
- ClassSchedule tenant isolation is enforced via `classGroup.organizationId` join.

## Commands

| Command | Permission | Description |
|---|---|---|
| CreateClassGroupCommand | class_groups.create | Create a new class group |
| UpdateClassGroupCommand | class_groups.update | Update name, dates, teacher, etc. |
| ArchiveClassGroupCommand | class_groups.archive | Set status to ARCHIVED |
| SoftDeleteClassGroupCommand | class_groups.delete | Soft-delete (blocks if active enrollments) |
| CreateClassScheduleCommand | class_schedules.create | Add a schedule entry to a class group |
| UpdateClassScheduleCommand | class_schedules.update | Update day/time/room of a schedule |
| DeleteClassScheduleCommand | class_schedules.delete | Hard-delete a schedule entry |

## Audit Events

| Event | Description |
|---|---|
| class_group.created | Emitted after group creation |
| class_group.updated | Emitted after field updates (stores old/new values) |
| class_group.archived | Emitted when archived (stores old status) |
| class_group.deleted | Emitted when soft-deleted (stores name, status, courseId) |
| class_schedule.created | Emitted after schedule creation |
| class_schedule.updated | Emitted after schedule edit (stores old/new day+time) |
| class_schedule.deleted | Emitted after schedule deletion (stores day+time) |

## Routes

| Route | Permission | Description |
|---|---|---|
| `/class-groups` | class_groups.read | List all class groups |
| `/class-groups/new` | class_groups.create | Create form |
| `/class-groups/[classGroupId]` | class_groups.read | Detail view with schedules |
| `/class-groups/[classGroupId]/edit` | class_groups.update | Edit form |

## Module Structure

```
src/modules/class-groups/
├── types/index.ts                     # ClassGroup, ClassSchedule, label maps
├── schemas/
│   ├── class-group.schema.ts          # Create/Update/Archive/Delete schemas
│   └── class-schedule.schema.ts       # Create/Update/Delete schemas
├── repositories/
│   ├── class-group.repository.ts      # DB access for ClassGroup
│   └── class-schedule.repository.ts   # DB access for ClassSchedule
├── services/
│   └── class-group.service.ts         # Read-only wrappers for pages
├── commands/
│   ├── create-class-group.command.ts
│   ├── update-class-group.command.ts
│   ├── archive-class-group.command.ts
│   ├── delete-class-group.command.ts
│   ├── create-class-schedule.command.ts
│   ├── update-class-schedule.command.ts
│   └── delete-class-schedule.command.ts
├── actions/
│   ├── class-group.actions.ts
│   └── class-schedule.actions.ts
└── components/
    ├── class-group-form.tsx            # Create and Edit forms
    ├── class-group-columns.tsx         # DataTable column definitions
    ├── class-groups-table.tsx          # Filterable table component
    ├── class-schedule-form.tsx         # Create and Edit schedule drawers
    └── class-schedule-panel.tsx        # Schedule list with inline management
```

## Out of Scope (Future Modules)

- **Enrollments**: `currentCount` on ClassGroup is maintained by the Enrollments module. The delete guard checks `enrollment.status NOT IN (CANCELLED, COMPLETED)`.
- **Attendance**: AttendanceRecord is linked to ClassGroup but managed by a separate module.
- **Payments**: Linked through Enrollment → Invoice → Payment.
