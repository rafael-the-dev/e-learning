# Domain Events

## Purpose

Domain Events decouple modules from each other. Instead of a command directly calling every downstream system, it emits an event. Independent handlers react to those events as side effects.

**Without domain events:**
```
ConfirmPaymentCommand
  → activateEnrollment()      // finance depends on enrollments
  → sendNotification()        // finance depends on communication
  → createStudentTimeline()   // finance depends on timeline
```

**With domain events:**
```
ConfirmPaymentCommand
  → emits payment.confirmed
  → EventBus dispatches to:
      EnrollmentActivationEventHandler
      CommunicationEventHandler
      StudentTimelineEventHandler
```

---

## AuditLog vs DomainEvent

| | AuditLog | DomainEvent |
|---|---|---|
| **Question answered** | "Who changed what?" | "What happened and what reacted?" |
| **Written by** | Every command, manually | EventBus, automatically |
| **Scope** | Entity-level changes | Cross-module side effects |
| **Handler tracking** | No | Yes — DomainEventHandlerLog |

Do not duplicate audit logging into event handlers. Keep AuditLog for entity mutations and DomainEvent for system-level reactions.

---

## Architecture

```
Command
  └─ execute()
       ├─ db.$transaction(...)   ← business data written
       └─ eventPublisher.publish(...)  ← AFTER transaction
            └─ EventBus
                 ├─ persist DomainEvent (status=PENDING)
                 └─ EventDispatcher
                      ├─ check DomainEventHandlerLog (idempotency)
                      ├─ run each handler
                      ├─ write DomainEventHandlerLog per handler
                      └─ update DomainEvent status
```

---

## Event Lifecycle

1. **PENDING** — event has been persisted, handlers not yet run
2. **PROCESSING** — (future use) event is being processed by an async worker
3. **PROCESSED** — all applicable handlers completed successfully
4. **FAILED** — one or more handlers failed; original business transaction is unaffected
5. **CANCELLED** — event was manually cancelled (future use)

---

## Handler Lifecycle

Each handler execution is tracked in `DomainEventHandlerLog`:

1. **PENDING** — log record created
2. **PROCESSING** — handler is running
3. **PROCESSED** — handler completed successfully
4. **FAILED** — handler threw an error; stored in `failureReason`
5. **SKIPPED** — handler decided not to process this event (e.g. missing data)

---

## Idempotency

The same handler **never runs twice** for the same event:

```
DomainEventHandlerLog has a unique index on (eventId, handlerName).
If status = PROCESSED → skip.
If status = SKIPPED   → skip.
If status = FAILED    → allow retry (retryCount increments).
```

This protects against duplicate processing if a retry mechanism is introduced.

---

## Transaction Safety

**Critical rule:** events are only published **after** the main database transaction commits.

```typescript
// Correct pattern in commands
await db.$transaction(async (tx) => {
  // all business mutations
});

// ← transaction committed here

await eventPublisher.publish({ ... });   // ← safe: transaction already succeeded
```

The `eventPublisher` wraps `EventBus.publish()` in a try/catch. If event infrastructure fails, the original business operation is **not** rolled back and the user **does not** see an error. The failure is logged via `console.error`.

---

## Payload Rules

- Payload must be JSON-serializable
- Payload must include reference IDs (not full objects)
- Handlers must re-fetch critical data from the database
- Never include sensitive secrets in payloads
- For financial handlers, do not trust payload amounts — re-validate from DB

Example payload for `payment.confirmed`:
```json
{
  "paymentId": "clxxx",
  "invoiceId": "clyyy",
  "studentId": "clzzz",
  "enrollmentId": "claaa",
  "confirmedAt": "2026-06-09T10:00:00.000Z",
  "_actorId": "cluuu"
}
```

---

## Supported Events

### Enrollment
| Event | Emitted by |
|---|---|
| `enrollment.created` | `CreateEnrollmentCommand` |
| `enrollment.activated` | `ActivateEnrollmentCommand` |

### Invoice
| Event | Emitted by |
|---|---|
| `invoice.created` | `CreateInvoiceCommand` |

### Payment
| Event | Emitted by |
|---|---|
| `payment.confirmed` | `ConfirmPaymentCommand` |

### Wallet
| Event | Emitted by |
|---|---|
| `wallet.deposit_created` | `CreateDepositCommand` |
| `wallet.credit_applied` | `ApplyWalletCreditCommand` |

### Lesson
| Event | Emitted by |
|---|---|
| `lesson.published` | `PublishLessonCommand` |

### Classroom
| Event | Emitted by |
|---|---|
| `classroom_booking.created` | `CreateClassroomBookingCommand` |

### Attendance
| Event | Emitted by | Why |
|---|---|---|
| `attendance.justification_approved` | `ApproveAttendanceJustificationCommand` | Student outcome change — approval reverses absence impact |
| `attendance.justification_rejected` | `RejectAttendanceJustificationCommand` | Student outcome change — rejection confirms absence stands |
| `attendance.student_at_risk` | `AttendanceCalculatorService` / `AttendanceRiskService` | Threshold crossed — triggers student notification and timeline |
| `attendance.student_below_required` | `AttendanceCalculatorService` / `AttendanceRiskService` | Minimum attendance breached — student may fail the subject |

**Events NOT emitted** (operational data, tracked via AuditLog only):

| Operation | Why no domain event |
|---|---|
| Create/Update/Cancel/Complete `AttendanceSession` | Session state is operational; no cross-module side effect |
| `MarkAttendance` / `BulkMarkAttendance` | Records are data mutations; risk evaluation triggers events separately |
| `UpdateAttendanceRecord` | Same as above |
| `CreateAttendanceJustification` | Justification creation is operational; only approval/rejection have business meaning |

See [attendance-management.md](./attendance-management.md) for the full audit log vs domain event distinction.

---

## Registered Handlers

| Handler | Handles |
|---|---|
| `CommunicationEventHandler` | `payment.confirmed`, `lesson.published`, `invoice.overdue`, `enrollment.activated`, `enrollment.cancelled`, `attendance.student_at_risk`, `attendance.student_below_required`, `attendance.justification_approved`, `attendance.justification_rejected` |
| `StudentTimelineEventHandler` | `enrollment.*`, `payment.confirmed`, `invoice.paid`, `wallet.*`, `lesson.completed`, `classroom_booking.*`, `notification.sent`, `attendance.justification_approved`, `attendance.justification_rejected`, `attendance.student_at_risk`, `attendance.student_below_required` |
| `EnrollmentActivationEventHandler` | `payment.confirmed` — auto-activates enrollment if billing policy rule is satisfied |

---

## How to Emit an Event from a New Command

1. Import the publisher and types:

```typescript
import { eventPublisher } from "@/server/events/event-publisher";
import { DomainEventType, DomainAggregateType } from "@/server/events/event-types";
```

2. Call `eventPublisher.publish()` after your transaction commits:

```typescript
await eventPublisher.publish({
  organizationId: this.context.organizationId,
  eventType: DomainEventType.ENROLLMENT_CREATED,
  aggregateType: DomainAggregateType.ENROLLMENT,
  aggregateId: enrollment.id,
  actorId: this.context.userId,
  payload: {
    enrollmentId: enrollment.id,
    studentId: enrollment.studentId,
  },
});
```

3. If the event type is new, add it to `src/server/events/event-types.ts`.

---

## How to Add a New Handler

1. Create a file in `src/server/events/handlers/`:

```typescript
export class MyNewHandler implements DomainEventHandler {
  readonly handlerName = "MyNewHandler";

  canHandle(event: PersistedDomainEvent): boolean {
    return event.eventType === DomainEventType.SOME_EVENT;
  }

  async handle(event: PersistedDomainEvent): Promise<void> {
    // side effect logic
    // re-fetch data from DB; do not trust payload for mutations
  }
}
```

2. Register it in `src/server/events/registry.ts`:

```typescript
export const registeredHandlers: DomainEventHandler[] = [
  // ...existing handlers
  new MyNewHandler(),
];
```

---

## RBAC

- Events are **internal system operations** — no user permission is checked when handlers run.
- The `DOMAIN_EVENTS_VIEW` permission gates the `/system/events` admin page.
- Event creation happens inside commands that already enforce RBAC before calling `eventPublisher`.

---

## Tenant Isolation

Every event has `organizationId` derived from:
- `this.context.organizationId` (from the command's ServiceContext)
- Never from client input

Handlers must only query within `event.organizationId`.

---

## Future Async Processing

The current architecture is synchronous. To move to async/background processing:

1. Replace `this.dispatcher.dispatch(persisted)` in `EventBus.publish()` with a queue enqueue call.
2. Create a background worker that polls `DomainEvent` where `status = PENDING` and calls `dispatcher.dispatch()`.
3. The `DomainEventHandlerLog` idempotency mechanism already protects against duplicate processing.
4. No changes are needed to commands or handlers.

---

## Admin UI

Route: `/system/events`

Features:
- List all domain events with filters (type, status, aggregate type, search)
- Stat cards: total, processed, pending, processing, failed
- Detail page at `/system/events/[eventId]` with payload viewer and handler log table
- Requires `DOMAIN_EVENTS_VIEW` permission
