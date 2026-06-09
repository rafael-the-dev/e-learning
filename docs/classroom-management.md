# Classroom Management Module

## Overview

The Classroom Management module manages physical and online classrooms, their features and resources, maintenance scheduling, and booking. It is designed to support schools, training centres, driving schools, and hybrid learning environments.

---

## Domain Model

```
Organization
    └── Branch
           └── Classroom
                   ├── ClassroomFeature  (amenities: projector, AC, etc.)
                   ├── ClassroomResource (physical assets: computers, etc.)
                   ├── ClassroomMaintenance (scheduled downtime)
                   └── ClassroomBooking  (links Classroom ↔ ClassGroup ↔ ScheduleSlot ↔ AcademicYear)
```

---

## Classroom

A classroom represents a physical room or a virtual meeting space.

### Key fields

| Field | Notes |
|---|---|
| `code` | Unique per branch (enforced in command layer) |
| `classroomType` | Enum string: STANDARD_ROOM, COMPUTER_LAB, LANGUAGE_LAB, DESIGN_STUDIO, DRIVING_ROOM, MEETING_ROOM, ONLINE_ROOM, OTHER |
| `capacity` | Max number of students; must be ≥ 1 |
| `meetingProvider` / `meetingUrl` | Only relevant for ONLINE_ROOM |
| `location` / `floor` | Only relevant for physical rooms |
| `status` | ACTIVE \| MAINTENANCE \| INACTIVE \| ARCHIVED |

### Rules

- `code` must be unique within the same branch (null branch = org-level).
- `capacity` must be > 0.
- ONLINE_ROOM rooms may carry `meetingProvider` and `meetingUrl`.
- Physical rooms may carry `location` and `floor`.

---

## Features vs Resources

| Concept | Model | Purpose |
|---|---|---|
| Feature | `ClassroomFeature` | Boolean amenity flag (has projector / has AC). Unique per classroom per type. No quantity. |
| Resource | `ClassroomResource` | Physical asset with a quantity (10 computers, 2 whiteboards). Can be updated or deleted. |

---

## Maintenance Workflow

```
SCHEDULED → IN_PROGRESS → COMPLETED
         ↘             ↘
          CANCELLED     CANCELLED
```

- A maintenance record blocks bookings for its date range while status is `SCHEDULED` or `IN_PROGRESS`.
- Only `SCHEDULED` and `IN_PROGRESS` maintenances can be cancelled.
- `COMPLETED` maintenances are historical; they cannot be altered.

---

## Booking Workflow

```
1. Select AcademicYear  (must be ACTIVE)
2. Select AcademicTerm  (optional; must belong to selected year and be ACTIVE)
3. Select ClassGroup    (optional; capacity is validated against classroom)
4. Select ScheduleSlot  (optional)
5. Select Classroom     (must be ACTIVE, no maintenance, no conflict)
6. Set startDate/endDate
7. Confirm Booking      → status: ACTIVE
```

### Booking states

```
ACTIVE → COMPLETED
       ↘ CANCELLED → ARCHIVED
```

---

## Conflict Detection

`ClassroomAvailabilityService.validateClassroomAvailability()` checks:

1. **Classroom status** — must be `ACTIVE`.
2. **Maintenance conflicts** — no `SCHEDULED` or `IN_PROGRESS` maintenance overlapping the date range.
3. **Booking conflicts** — no other `ACTIVE` booking for the same classroom overlapping the date range.
4. **Capacity** — `ClassGroup.capacity` must not exceed `Classroom.capacity`.

A conflict is defined as: `existingBooking.startDate ≤ newEndDate AND existingBooking.endDate ≥ newStartDate`.

---

## Capacity Validation

When creating a booking with a `classGroupId`:

- The system loads `ClassGroup.capacity`.
- Compares it against `Classroom.capacity`.
- Blocks the booking if `classGroupCapacity > classroomCapacity`.
- The error is surfaced in the form with a warning alert before submission.

---

## Academic Calendar Integration

`ClassroomBooking` must reference an `AcademicYear` and optionally an `AcademicTerm`.

- `academicYearId` is required. Year must be `ACTIVE`.
- `academicTermId` is optional. If provided, the term must belong to the selected year and be `ACTIVE`.

---

## Online Classroom Support

- `classroomType = ONLINE_ROOM` rooms support `meetingProvider` (ZOOM, GOOGLE_MEET, MICROSOFT_TEAMS, CUSTOM) and `meetingUrl`.
- Online rooms are booked exactly like physical rooms — conflict and maintenance rules apply.
- The meeting URL is displayed on the classroom detail page with a clickable link.

---

## Tenant Isolation

- `organizationId` is **never** accepted from client input. It is always resolved via `requireOrganization()`.
- Every repository query filters by `organizationId`.
- All command validators check that referenced entities (`classroomId`, `classGroupId`, `scheduleSlotId`, `academicYearId`, `academicTermId`, `branchId`) belong to the active organization.

---

## Permissions

| Permission | Key |
|---|---|
| `classrooms.view` | `CLASSROOMS_VIEW` |
| `classrooms.create` | `CLASSROOMS_CREATE` |
| `classrooms.update` | `CLASSROOMS_UPDATE` |
| `classrooms.archive` | `CLASSROOMS_ARCHIVE` |
| `classrooms.delete` | `CLASSROOMS_DELETE` |
| `classroomFeatures.manage` | `CLASSROOM_FEATURES_MANAGE` |
| `classroomResources.view` | `CLASSROOM_RESOURCES_VIEW` |
| `classroomResources.create` | `CLASSROOM_RESOURCES_CREATE` |
| `classroomResources.update` | `CLASSROOM_RESOURCES_UPDATE` |
| `classroomResources.delete` | `CLASSROOM_RESOURCES_DELETE` |
| `classroomMaintenance.view` | `CLASSROOM_MAINTENANCE_VIEW` |
| `classroomMaintenance.create` | `CLASSROOM_MAINTENANCE_CREATE` |
| `classroomMaintenance.update` | `CLASSROOM_MAINTENANCE_UPDATE` |
| `classroomMaintenance.cancel` | `CLASSROOM_MAINTENANCE_CANCEL` |
| `classroomBookings.view` | `CLASSROOM_BOOKINGS_VIEW` |
| `classroomBookings.create` | `CLASSROOM_BOOKINGS_CREATE` |
| `classroomBookings.update` | `CLASSROOM_BOOKINGS_UPDATE` |
| `classroomBookings.cancel` | `CLASSROOM_BOOKINGS_CANCEL` |

### Role Matrix

| Role | Classrooms | Features | Resources | Maintenance | Bookings |
|---|---|---|---|---|---|
| ORG_ADMIN | All | manage | All | All | All |
| SECRETARY | view | — | view | view | view, create, update, cancel |
| TEACHER | view | — | — | — | view |
| STUDENT | — | — | — | — | view |

---

## Architecture

```
src/modules/classrooms/
├── actions/
│   ├── classroom.actions.ts
│   ├── classroom-feature.actions.ts
│   ├── classroom-resource.actions.ts
│   ├── classroom-maintenance.actions.ts
│   └── classroom-booking.actions.ts
├── commands/
│   ├── create-classroom.command.ts
│   ├── update-classroom.command.ts
│   ├── archive-classroom.command.ts
│   ├── add-classroom-feature.command.ts
│   ├── remove-classroom-feature.command.ts
│   ├── create-classroom-resource.command.ts
│   ├── update-classroom-resource.command.ts
│   ├── delete-classroom-resource.command.ts
│   ├── create-classroom-maintenance.command.ts
│   ├── update-classroom-maintenance.command.ts
│   ├── cancel-classroom-maintenance.command.ts
│   ├── create-classroom-booking.command.ts
│   ├── update-classroom-booking.command.ts
│   └── cancel-classroom-booking.command.ts
├── components/
│   ├── classroom-columns.tsx
│   ├── classrooms-table.tsx
│   ├── classroom-form.tsx
│   ├── classroom-detail-actions.tsx
│   ├── classroom-feature-panel.tsx
│   ├── classroom-resource-panel.tsx
│   ├── classroom-maintenance-panel.tsx
│   ├── classroom-booking-columns.tsx
│   ├── classroom-bookings-table.tsx
│   └── classroom-booking-form.tsx
├── repositories/
│   ├── classroom.repository.ts
│   ├── classroom-feature.repository.ts
│   ├── classroom-resource.repository.ts
│   ├── classroom-maintenance.repository.ts
│   └── classroom-booking.repository.ts
├── schemas/
│   ├── classroom.schema.ts
│   ├── classroom-feature.schema.ts
│   ├── classroom-resource.schema.ts
│   ├── classroom-maintenance.schema.ts
│   └── classroom-booking.schema.ts
├── services/
│   ├── classroom.service.ts
│   └── classroom-availability.service.ts
└── types/
    └── index.ts
```

---

## Audit Events

| Event | Trigger |
|---|---|
| `classroom.created` | CreateClassroomCommand |
| `classroom.updated` | UpdateClassroomCommand |
| `classroom.archived` | ArchiveClassroomCommand |
| `classroom_feature.added` | AddClassroomFeatureCommand |
| `classroom_feature.removed` | RemoveClassroomFeatureCommand |
| `classroom_resource.created` | CreateClassroomResourceCommand |
| `classroom_resource.updated` | UpdateClassroomResourceCommand |
| `classroom_resource.deleted` | DeleteClassroomResourceCommand |
| `classroom_maintenance.created` | CreateClassroomMaintenanceCommand |
| `classroom_maintenance.updated` | UpdateClassroomMaintenanceCommand |
| `classroom_maintenance.cancelled` | CancelClassroomMaintenanceCommand |
| `classroom_booking.created` | CreateClassroomBookingCommand |
| `classroom_booking.updated` | UpdateClassroomBookingCommand |
| `classroom_booking.cancelled` | CancelClassroomBookingCommand |

---

## Routes

| Route | Description |
|---|---|
| `GET /classrooms` | Classroom library with filters and stat cards |
| `GET /classrooms/new` | Create classroom form |
| `GET /classrooms/[classroomId]` | Classroom detail: info, features, resources, maintenance |
| `GET /classrooms/[classroomId]/edit` | Edit classroom form |
| `GET /classroom-bookings` | All bookings with filters |
| `GET /classroom-bookings/new` | Create booking form (full workflow) |
| `GET /classroom-bookings/[bookingId]` | Booking detail |

---

## Running the migration

After merging, run:

```bash
npx prisma migrate dev --name add_classroom_management
```

Then reseed permissions so the new classroom permissions are registered in the database.
