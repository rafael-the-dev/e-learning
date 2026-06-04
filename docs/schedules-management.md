# Schedules Management

## Overview

The scheduling architecture provides reusable, organization-scoped schedule definitions. Admins define **SchedulePeriods** and **ScheduleSlots** once; these are then assigned to **ClassGroups** via a junction table.

## Domain Model

```
Organization
  └── SchedulePeriod (e.g., "Morning", "Afternoon")
        └── ScheduleSlot (e.g., Monday 08:00–10:00)
                └── ClassGroupSchedule (junction)
                      └── ClassGroup
```

### SchedulePeriod
A named grouping for schedule slots within an organization.

| Field | Description |
|---|---|
| `id` | CUID primary key |
| `organizationId` | Tenant scope |
| `name` | Display name (e.g., "Manhã") |
| `code` | Unique code within org (e.g., "MORNING") |
| `description` | Optional free text |
| `status` | `ACTIVE` \| `INACTIVE` \| `ARCHIVED` |
| `deletedAt` | Soft delete timestamp |

**Constraint:** `code` is unique per `organizationId`.

### ScheduleSlot
A specific time slot on a given day, linked to a period.

| Field | Description |
|---|---|
| `id` | CUID primary key |
| `organizationId` | Tenant scope |
| `schedulePeriodId` | Parent period |
| `dayOfWeek` | `MONDAY` \| `TUESDAY` \| … \| `SUNDAY` |
| `startTime` | `HH:MM` (24h) |
| `endTime` | `HH:MM` (24h) |
| `status` | `ACTIVE` \| `INACTIVE` \| `ARCHIVED` |
| `deletedAt` | Soft delete timestamp |

**Constraints:**
- `startTime < endTime` enforced at validation layer.
- `(schedulePeriodId, dayOfWeek, startTime, endTime)` is unique — prevents duplicate slots per period.

### ClassGroupSchedule
Junction table assigning ScheduleSlots to ClassGroups.

| Field | Description |
|---|---|
| `id` | CUID primary key |
| `organizationId` | Tenant scope |
| `classGroupId` | Target class group |
| `scheduleSlotId` | Assigned slot |
| `status` | `ACTIVE` \| `INACTIVE` \| `ARCHIVED` |
| `deletedAt` | Soft delete timestamp |

**Constraint:** `(classGroupId, scheduleSlotId)` is unique — prevents the same slot from being assigned twice to the same group.

## Why Reusable Schedules

Previously, `ClassSchedule` stored `dayOfWeek + startTime + endTime` directly on each class group. Each group had its own schedule copies.

The new architecture separates **definition** (ScheduleSlot) from **assignment** (ClassGroupSchedule):
- Slots are defined once and reused across many class groups.
- Changing a slot definition reflects immediately for all assigned groups.
- Periods group slots for easier browsing (Morning, Afternoon, etc.).

## Permissions

| Permission | Description |
|---|---|
| `schedulePeriods.view` | List and view periods |
| `schedulePeriods.create` | Create a new period |
| `schedulePeriods.update` | Edit an existing period |
| `schedulePeriods.archive` | Archive a period |
| `schedulePeriods.delete` | Soft-delete a period (only if no active slots) |
| `scheduleSlots.view` | List and view slots |
| `scheduleSlots.create` | Create a new slot |
| `scheduleSlots.update` | Edit an existing slot |
| `scheduleSlots.archive` | Archive a slot |
| `scheduleSlots.delete` | Soft-delete a slot (only if not assigned to active groups) |
| `classGroupSchedules.view` | View schedule assignments |
| `classGroupSchedules.assign` | Assign a slot to a class group |
| `classGroupSchedules.remove` | Remove a slot assignment from a class group |

### Role Matrix

| Role | Periods | Slots | ClassGroupSchedules |
|---|---|---|---|
| `ORG_ADMIN` | Full | Full | Full |
| `SECRETARY` | view | view | view, assign, remove |
| `TEACHER` | view | view | view |

## Tenant Isolation

- `organizationId` is **never** accepted from client input.
- All queries read `activeOrganizationId` from `requireOrganization()`.
- Every query includes `organizationId` in the WHERE clause.
- `schedulePeriodId` is validated against `activeOrganizationId` before creating a slot.
- `scheduleSlotId` is validated against `activeOrganizationId` before assigning.
- `classGroupId` is validated against `activeOrganizationId` before assigning.

## Business Rules

1. `SchedulePeriod.code` must be unique within the organization.
2. `ScheduleSlot.startTime < endTime` — enforced by Zod refine.
3. No duplicate slot within a period: same `schedulePeriodId + dayOfWeek + startTime + endTime`.
4. No duplicate assignment: same `classGroupId + scheduleSlotId`.
5. Cannot delete a `SchedulePeriod` that has active slots — archive first.
6. Cannot delete a `ScheduleSlot` that is assigned to active class groups — remove assignments first.
7. Archive is preferred over delete when safe destruction is unclear.

## Audit Events

| Event | Trigger |
|---|---|
| `schedule_period.created` | Period created |
| `schedule_period.updated` | Period fields changed |
| `schedule_period.archived` | Status set to ARCHIVED |
| `schedule_period.deleted` | Period soft-deleted |
| `schedule_slot.created` | Slot created |
| `schedule_slot.updated` | Slot fields changed |
| `schedule_slot.archived` | Status set to ARCHIVED |
| `schedule_slot.deleted` | Slot soft-deleted |
| `class_group_schedule.assigned` | Slot assigned to class group |
| `class_group_schedule.removed` | Slot removed from class group |

## Module Structure

```
src/modules/schedules/
├── actions/
│   ├── schedule-period.actions.ts
│   ├── schedule-slot.actions.ts
│   └── class-group-schedule.actions.ts
├── commands/
│   ├── create-schedule-period.command.ts
│   ├── update-schedule-period.command.ts
│   ├── archive-schedule-period.command.ts
│   ├── delete-schedule-period.command.ts
│   ├── create-schedule-slot.command.ts
│   ├── update-schedule-slot.command.ts
│   ├── archive-schedule-slot.command.ts
│   ├── delete-schedule-slot.command.ts
│   ├── assign-schedule-slot.command.ts
│   └── remove-schedule-slot.command.ts
├── components/
│   ├── class-group-schedule-panel.tsx
│   ├── period-columns.tsx
│   ├── schedule-period-form.tsx
│   ├── schedule-periods-table.tsx
│   ├── schedule-slot-form.tsx
│   ├── schedule-slots-table.tsx
│   └── slot-columns.tsx
├── repositories/
│   ├── class-group-schedule.repository.ts
│   ├── schedule-period.repository.ts
│   └── schedule-slot.repository.ts
├── schemas/
│   ├── class-group-schedule.schema.ts
│   ├── schedule-period.schema.ts
│   └── schedule-slot.schema.ts
├── services/
│   └── schedule.service.ts
└── types/
    └── index.ts
```

## UI Routes

| Route | Description |
|---|---|
| `/schedules` | Tabbed page: Periods tab + Slots tab |

From the Periods tab you can create, edit, archive, and delete periods with search and status filter.
From the Slots tab you can filter by period and day, and create, edit, archive, and delete slots.
