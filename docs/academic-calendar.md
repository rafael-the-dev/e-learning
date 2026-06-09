# Academic Calendar Module

## Overview

The Academic Calendar module allows each organization to manage its own academic year structure, including terms/periods, holidays, and events. It is fully multi-tenant: every record is scoped to `organizationId`, which is always resolved from the authenticated session — never accepted from client input.

---

## Domain Models

### AcademicYear

Represents a full academic year (e.g., "2024/2025").

| Field | Type | Notes |
|---|---|---|
| id | cuid | Primary key |
| organizationId | String | Tenant scope |
| name | String | e.g., "2024/2025" |
| code | String | Unique per org, e.g., "AY-2024-25" |
| startDate | DateTime | Must be before endDate |
| endDate | DateTime | |
| status | String | DRAFT \| ACTIVE \| COMPLETED \| CANCELLED \| ARCHIVED |
| isDefault | Boolean | Only one may be true per org at a time |
| deletedAt | DateTime? | Soft delete |

**Business rules:**
- `code` is unique per organization.
- Only one `isDefault` year per organization — `setDefaultAcademicYear` clears all others first.
- Archiving requires all active terms to be archived first.
- Deleting the default year is not permitted.

### AcademicTerm

Represents a period within an academic year (e.g., "1.º Período").

| Field | Type | Notes |
|---|---|---|
| academicYearId | String | FK → AcademicYear (must belong to same org) |
| order | Int | Unique per academic year |
| startDate / endDate | DateTime | Must be within AcademicYear date range |

**Business rules:**
- `code` is unique per academic year.
- `order` is unique per academic year.
- Dates must be within the parent `AcademicYear` date range.
- Dates must not overlap with other terms in the same academic year.

### AcademicHoliday

Represents a holiday or non-instructional period. May be organization-wide (no `academicYearId`) or scoped to a specific year.

| Field | Type | Notes |
|---|---|---|
| academicYearId | String? | Optional year scope |
| isRecurring | Boolean | Marks holidays that repeat annually |

**Business rule:** `startDate <= endDate`.

### AcademicEvent

Represents a scheduled event in the academic calendar (exam periods, enrollment windows, payment deadlines, etc.).

| Field | Type | Notes |
|---|---|---|
| academicYearId | String? | Optional year scope |
| academicTermId | String? | Optional term scope (must belong to same org) |
| eventType | String | See Event Types below |

**Business rule:** `startDate <= endDate`.

---

## Event Types

| Value | Label |
|---|---|
| GENERAL | Geral |
| EXAM_PERIOD | Período de Exames |
| ENROLLMENT_PERIOD | Período de Matrículas |
| PAYMENT_DEADLINE | Prazo de Pagamento |
| HOLIDAY | Feriado |
| TEACHER_MEETING | Reunião de Professores |
| GRADUATION | Formatura |
| OTHER | Outro |

---

## Status Values

All entities share the same status enum: `DRAFT | ACTIVE | COMPLETED | CANCELLED | ARCHIVED`.

---

## Permissions

| Permission | Description |
|---|---|
| `academicCalendar.view` | View all calendar data |
| `academicYears.create` | Create academic years |
| `academicYears.update` | Edit academic years |
| `academicYears.setDefault` | Mark a year as default |
| `academicYears.archive` | Archive academic years |
| `academicYears.delete` | Soft-delete academic years |
| `academicTerms.create` | Create terms |
| `academicTerms.update` | Edit terms |
| `academicTerms.archive` | Archive terms |
| `academicTerms.delete` | Soft-delete terms |
| `academicHolidays.create` | Create holidays |
| `academicHolidays.update` | Edit holidays |
| `academicHolidays.archive` | Archive holidays |
| `academicHolidays.delete` | Soft-delete holidays |
| `academicEvents.create` | Create events |
| `academicEvents.update` | Edit events |
| `academicEvents.archive` | Archive events |
| `academicEvents.delete` | Soft-delete events |

### Role Matrix

| Role | View | Create/Update | Set Default | Archive | Delete |
|---|---|---|---|---|---|
| ORG_ADMIN | ✓ | ✓ | ✓ | ✓ | ✓ |
| SECRETARY | ✓ | ✓ (events & holidays) | — | — | — |
| TEACHER | ✓ | — | — | — | — |
| STUDENT | ✓ | — | — | — | — |

---

## Tenant Isolation Rules

- `organizationId` is **never accepted from client input**. It is always resolved from `requireOrganization()`.
- Every repository query filters by `organizationId`.
- FK targets (`academicYearId`, `academicTermId`) are validated against `organizationId` inside commands before use. A client cannot reference a foreign organization's year or term.

---

## Architecture

```
src/modules/academic-calendar/
├── types/index.ts                  — Domain types, status/event-type constants and labels
├── schemas/
│   ├── academic-year.schema.ts
│   ├── academic-term.schema.ts
│   ├── academic-holiday.schema.ts
│   └── academic-event.schema.ts
├── repositories/
│   ├── academic-year.repository.ts
│   ├── academic-term.repository.ts
│   ├── academic-holiday.repository.ts
│   └── academic-event.repository.ts
├── services/
│   └── academic-calendar.service.ts  — Read-only wrappers + dashboard aggregation
├── commands/
│   ├── create-academic-year.command.ts
│   ├── update-academic-year.command.ts
│   ├── set-default-academic-year.command.ts
│   ├── archive-academic-year.command.ts
│   ├── delete-academic-year.command.ts
│   ├── create-academic-term.command.ts
│   ├── update-academic-term.command.ts
│   ├── archive-academic-term.command.ts  (also exports SoftDeleteAcademicTermCommand)
│   ├── create-academic-holiday.command.ts
│   ├── update-academic-holiday.command.ts  (also exports Archive/Delete)
│   ├── create-academic-event.command.ts
│   └── update-academic-event.command.ts  (also exports Archive/Delete)
├── actions/
│   ├── academic-year.actions.ts
│   ├── academic-term.actions.ts
│   ├── academic-holiday.actions.ts
│   └── academic-event.actions.ts
└── components/
    ├── academic-year-columns.tsx
    ├── academic-term-columns.tsx
    ├── academic-holiday-columns.tsx
    ├── academic-event-columns.tsx
    ├── academic-year-form.tsx
    ├── academic-term-form.tsx
    ├── academic-holiday-form.tsx
    ├── academic-event-form.tsx
    ├── academic-years-table.tsx
    ├── academic-terms-table.tsx
    ├── academic-holidays-table.tsx
    └── academic-events-table.tsx
```

---

## Routes

| Route | Description |
|---|---|
| `/academic-calendar` | Dashboard with current year, active term, upcoming holidays/events |
| `/academic-calendar/years` | List, create, edit, set default, archive academic years |
| `/academic-calendar/years/[academicYearId]` | Year detail with its terms |
| `/academic-calendar/terms` | All terms across all years, filterable by year |
| `/academic-calendar/holidays` | All holidays, filterable by year |
| `/academic-calendar/events` | All events, filterable by year, term, type, status |

---

## Audit Events

| Action | Trigger |
|---|---|
| `academic_year.created` | CreateAcademicYearCommand |
| `academic_year.updated` | UpdateAcademicYearCommand |
| `academic_year.default_set` | SetDefaultAcademicYearCommand |
| `academic_year.archived` | ArchiveAcademicYearCommand |
| `academic_year.deleted` | SoftDeleteAcademicYearCommand |
| `academic_term.created` | CreateAcademicTermCommand |
| `academic_term.updated` | UpdateAcademicTermCommand |
| `academic_term.archived` | ArchiveAcademicTermCommand |
| `academic_term.deleted` | SoftDeleteAcademicTermCommand |
| `academic_holiday.created` | CreateAcademicHolidayCommand |
| `academic_holiday.updated` | UpdateAcademicHolidayCommand |
| `academic_holiday.archived` | ArchiveAcademicHolidayCommand |
| `academic_holiday.deleted` | SoftDeleteAcademicHolidayCommand |
| `academic_event.created` | CreateAcademicEventCommand |
| `academic_event.updated` | UpdateAcademicEventCommand |
| `academic_event.archived` | ArchiveAcademicEventCommand |
| `academic_event.deleted` | SoftDeleteAcademicEventCommand |

---

## Future Integrations

When other modules integrate with the Academic Calendar, they should:

1. **Attendance** — filter attendance records by `academicTermId` to generate per-term reports.
2. **Assessments** — link assessments to `AcademicEvent` of type `EXAM_PERIOD`.
3. **Enrollment** — validate that new enrollments fall within an active `AcademicYear` with `status === "ACTIVE"`.
4. **Billing** — use `PAYMENT_DEADLINE` events to trigger overdue notifications.
5. **Certificates** — require a `COMPLETED` `AcademicYear` before issuing certificates.

All such integrations must validate FK references against `organizationId` — they must not assume that a provided `academicYearId` belongs to the same tenant without an explicit repository check.
