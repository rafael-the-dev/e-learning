# Student Timeline

## Purpose

The Student Timeline records every significant event in a student's lifecycle in chronological order, providing a complete audit trail that answers:

- What happened to this student?
- When did it happen?
- Which module caused it?
- What entity is related?
- Who triggered it?
- What changed?

---

## Event Types

| Event Type | Module | Default Visibility |
|---|---|---|
| `ENROLLMENT_CREATED` | Matrículas | INTERNAL |
| `ENROLLMENT_ACTIVATED` | Matrículas | STUDENT_VISIBLE |
| `ENROLLMENT_CANCELLED` | Matrículas | STUDENT_VISIBLE |
| `INVOICE_CREATED` | Faturação | INTERNAL |
| `INVOICE_PAID` | Faturação | INTERNAL |
| `PAYMENT_CONFIRMED` | Pagamentos | INTERNAL |
| `RECEIPT_ISSUED` | Recibos | INTERNAL |
| `WALLET_DEPOSIT_CREATED` | Carteira | INTERNAL |
| `WALLET_CREDIT_APPLIED` | Carteira | INTERNAL |
| `WALLET_OVERPAYMENT_CREATED` | Carteira | INTERNAL |
| `LESSON_COMPLETED` | Lições | STUDENT_VISIBLE |
| `CLASS_GROUP_ASSIGNED` | Turmas | STUDENT_VISIBLE |
| `CLASSROOM_BOOKING_CHANGED` | Salas | INTERNAL |
| `NOTIFICATION_SENT` | Comunicações | INTERNAL |
| `MANUAL_NOTE` | Notas | INTERNAL |

---

## Domain Event Integration

The `StudentTimelineEventHandler` listens to the following domain events:

| Domain Event | Timeline Event Type |
|---|---|
| `enrollment.created` | `ENROLLMENT_CREATED` + optionally `CLASS_GROUP_ASSIGNED` |
| `enrollment.activated` | `ENROLLMENT_ACTIVATED` |
| `enrollment.cancelled` | `ENROLLMENT_CANCELLED` |
| `enrollment.completed` | `ENROLLMENT_ACTIVATED` (reused) |
| `invoice.created` | `INVOICE_CREATED` |
| `invoice.paid` | `INVOICE_PAID` |
| `payment.confirmed` | `PAYMENT_CONFIRMED` |
| `receipt.issued` | `RECEIPT_ISSUED` |
| `wallet.deposit_created` | `WALLET_DEPOSIT_CREATED` |
| `wallet.credit_applied` | `WALLET_CREDIT_APPLIED` |
| `wallet.overpayment_created` | `WALLET_OVERPAYMENT_CREATED` |
| `wallet.refund_created` | `WALLET_DEPOSIT_CREATED` (with metadata type=REFUND) |
| `lesson.completed` | `LESSON_COMPLETED` |
| `classroom_booking.created/updated/cancelled` | `CLASSROOM_BOOKING_CHANGED` |
| `notification.sent` | `NOTIFICATION_SENT` |

### Handler Registration

The handler is registered in `src/server/events/registry.ts` and runs synchronously within the event bus dispatch cycle.

---

## Idempotency

Timeline events created from domain events are idempotent. Before creating a record, the handler checks:

```ts
findTimelineEventBySourceAndType(event.id, timelineEventType, organizationId)
```

If a matching record already exists, creation is skipped. This prevents duplicates if the event bus replays events on failure.

The `sourceEventId` field stores the `DomainEvent.id` that caused the timeline entry.

Manual notes (`MANUAL_NOTE`) have no `sourceEventId`, so they are not subject to this constraint.

---

## Manual Notes

Authorised staff can add free-text annotations to a student's timeline via the `CreateStudentTimelineManualNoteCommand`. Fields:

- `title` — required, max 255 chars
- `description` — optional, max 4000 chars
- `occurredAt` — required datetime
- `metadata` — optional JSON

Manual notes are `INTERNAL` by default and can be soft-deleted by users with `studentTimeline.deleteNote` permission. System events are **immutable** and cannot be deleted.

---

## Visibility Rules

| Role | Access |
|---|---|
| ORG_ADMIN | All events (INTERNAL + STUDENT_VISIBLE) |
| SECRETARY | All events (INTERNAL + STUDENT_VISIBLE) |
| TEACHER | All events for assigned students |
| STUDENT | `STUDENT_VISIBLE` events only (future) |

The `visibility` field on each record is set automatically based on `TIMELINE_EVENT_DEFAULT_VISIBILITY`. Staff see everything. Future student-facing views should filter by `visibility = STUDENT_VISIBLE`.

---

## Tenant Isolation

Every `StudentTimelineEvent` record has `organizationId`. All repository queries include `organizationId` in their `WHERE` clause. The `organizationId` is always taken from the server-side `ServiceContext` — never from client input.

---

## Permissions

| Permission | Constant | Description |
|---|---|---|
| `studentTimeline.view` | `STUDENT_TIMELINE_VIEW` | Read timeline events |
| `studentTimeline.createNote` | `STUDENT_TIMELINE_CREATE_NOTE` | Add manual notes |
| `studentTimeline.deleteNote` | `STUDENT_TIMELINE_DELETE_NOTE` | Soft-delete manual notes |

Default role assignments:

| Role | Permissions |
|---|---|
| SUPER_ADMIN | All |
| ORG_ADMIN | All |
| SECRETARY | view, createNote |
| TEACHER | view, createNote |
| STUDENT | (none by default — future) |

---

## Audit Log

Manual note operations emit audit log entries:

| Action | Trigger |
|---|---|
| `student_timeline.manual_note_created` | `CreateStudentTimelineManualNoteCommand` |
| `student_timeline.manual_note_deleted` | `DeleteStudentTimelineManualNoteCommand` |

System-generated events do not emit separate audit logs (the originating domain event already provides traceability via `sourceEventId`).

---

## Module Structure

```
src/modules/student-timeline/
├── types/index.ts                  Event types, reference types, visibility, labels
├── schemas/student-timeline.schema.ts  Zod schemas for commands
├── repositories/
│   └── student-timeline.repository.ts  DB access layer
├── services/
│   └── student-timeline.service.ts     Read-only service for pages
├── commands/
│   ├── create-student-timeline-event.command.ts
│   ├── create-student-timeline-manual-note.command.ts
│   └── delete-student-timeline-manual-note.command.ts
├── actions/
│   └── student-timeline.actions.ts     Server actions (Next.js)
└── components/
    ├── timeline-event-icon.tsx
    ├── timeline-item.tsx
    ├── timeline-list.tsx
    ├── timeline-filters.tsx
    ├── timeline-detail-sheet.tsx
    ├── add-note-dialog.tsx
    ├── add-note-button.tsx
    └── student-timeline-preview.tsx

src/server/events/handlers/
└── student-timeline.handler.ts         Domain event → timeline entry
```

Routes:

- `/students/[studentId]/timeline` — full timeline page with filters
- `/students/[studentId]` — student detail page includes a 5-event preview

---

## Known Limitations

### `ENROLLMENT_COMPLETED` reuses `ENROLLMENT_ACTIVATED` event type

The `enrollment.completed` domain event maps to the `ENROLLMENT_ACTIVATED` timeline event type (not a dedicated `ENROLLMENT_COMPLETED` type). This means:

- Filtering by `ENROLLMENT_ACTIVATED` in the UI will return both activation and completion events.
- The entry title will read "Matrícula concluída" to distinguish it visually, but the stored `eventType` value is `ENROLLMENT_ACTIVATED`.

This is intentional to avoid adding an event type solely for a rare lifecycle state. If a dedicated `ENROLLMENT_COMPLETED` timeline type is needed in future, add it to `TIMELINE_EVENT_TYPE` and update the handler, labels, visibility config, and icon maps.

---

## Future: AI Integration

The `metadata` JSON field and the `sourceEventId` traceability chain are designed to support future AI summarisation:

- An AI model could read the timeline and generate a natural-language summary of the student's journey.
- The `visibility` field ensures the AI can produce separate views for staff (full context) and students (filtered).
- Metadata stores structured context (amounts, IDs, types) that can be included in AI prompts without exposing sensitive data.
