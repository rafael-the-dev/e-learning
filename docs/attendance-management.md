# Attendance Management

## Overview

The attendance module tracks student presence across class sessions and subjects. It distinguishes clearly between **operational records** (session creation, marking attendance) and **business-significant events** (student at risk, justification outcomes).

---

## Audit Log vs Domain Events

| | AuditLog | DomainEvent |
|---|---|---|
| **Question answered** | "Who changed what?" | "What happened that requires a reaction?" |
| **Written by** | Every command, manually | Only when a business threshold is crossed |
| **Cross-module side effects** | None | Yes — timeline, notifications |
| **Handler tracking** | No | Yes — `DomainEventHandlerLog` |

### Why attendance records do not emit domain events

Attendance marking, session creation, and record updates are **operational data mutations**. They are equivalent to updating a row in a table — they do not, by themselves, mean anything to other modules.

Emitting a domain event for every `MarkAttendance` call would:
- Flood the event bus with noise (one event per student per session)
- Force downstream handlers to recompute the same risk threshold dozens of times
- Create false signals for notifications and timeline entries

The correct model is:
1. Commands mutate attendance data.
2. Commands write audit log entries for traceability.
3. After a bulk marking operation, the **AttendanceCalculatorService** or **AttendanceRiskService** evaluates whether a student has crossed a meaningful threshold.
4. Only when a threshold is crossed does a domain event get emitted.

---

## Allowed Attendance Domain Events

### `attendance.justification_approved`

**Emitted by:** `ApproveAttendanceJustificationCommand`

**Why:** Approval reverses the impact of an absence on a student's attendance percentage. This is a business decision with downstream effects (student may no longer be at risk).

**Expected payload:**
```json
{
  "justificationId": "clxxx",
  "studentId": "clyyy",
  "enrollmentId": "clzzz",
  "levelSubjectId": "claaa",
  "subjectName": "Matemática",
  "approvedAt": "2026-06-09T10:00:00.000Z"
}
```

---

### `attendance.justification_rejected`

**Emitted by:** `RejectAttendanceJustificationCommand`

**Why:** Rejection confirms the absence stands. The student should be notified and the rejection should appear on their timeline.

**Expected payload:**
```json
{
  "justificationId": "clxxx",
  "studentId": "clyyy",
  "enrollmentId": "clzzz",
  "levelSubjectId": "claaa",
  "subjectName": "Matemática",
  "rejectionReason": "Documento inválido",
  "rejectedAt": "2026-06-09T10:00:00.000Z"
}
```

---

### `attendance.student_at_risk`

**Emitted by:** `AttendanceCalculatorService` / `AttendanceRiskService`

**Why:** The student's attendance percentage has dropped to a warning threshold (e.g. within 5% of the minimum). This is the earliest signal — the student has not yet failed, but is at risk.

**Idempotency:** Do not emit this event again for the same `(studentId, enrollmentId, levelSubjectId)` combination if the student is already in a risk state and no new attendance has been recorded. Evaluate only after new attendance data is saved.

**Expected payload:**
```json
{
  "studentId": "clxxx",
  "enrollmentId": "clyyy",
  "levelSubjectId": "clzzz",
  "subjectName": "Matemática",
  "currentPercentage": 72.5,
  "minimumPercentage": 75.0,
  "riskPeriod": "2026-S1"
}
```

---

### `attendance.student_below_required`

**Emitted by:** `AttendanceCalculatorService` / `AttendanceRiskService`

**Why:** The student has fallen below `LevelSubject.minimumAttendancePercentage`. This is the critical signal — the student is failing attendance.

**Idempotency:** Do not re-emit if the student is already below required and no new attendance data has been recorded since the last emission. Emit again only when a new transition occurs (e.g. was above, dropped below again after justification changed the count).

**Expected payload:**
```json
{
  "studentId": "clxxx",
  "enrollmentId": "clyyy",
  "levelSubjectId": "clzzz",
  "subjectName": "Matemática",
  "currentPercentage": 68.0,
  "minimumPercentage": 75.0
}
```

---

## Events NOT Emitted

| Command | Why no event |
|---|---|
| `CreateAttendanceSessionCommand` | Session creation is operational; no cross-module reaction needed |
| `UpdateAttendanceSessionCommand` | Metadata change; no downstream side effect |
| `CancelAttendanceSessionCommand` | Operational; write audit log only |
| `CompleteAttendanceSessionCommand` | Completion alone does not change student risk — the calculator runs separately |
| `MarkAttendanceCommand` | Individual record; risk threshold evaluated separately |
| `BulkMarkAttendanceCommand` | Bulk operational write; risk threshold evaluated after bulk completes |
| `UpdateAttendanceRecordCommand` | Correction of operational data; risk re-evaluation is a separate concern |
| `CreateAttendanceJustificationCommand` | Creation is a request, not a decision; only approval/rejection carry meaning |

---

## Audit Log Entries

Every command must write an audit log entry, regardless of whether it emits a domain event:

| Command | Audit action |
|---|---|
| `CreateAttendanceSessionCommand` | `attendance_session.created` |
| `UpdateAttendanceSessionCommand` | `attendance_session.updated` |
| `CancelAttendanceSessionCommand` | `attendance_session.cancelled` |
| `CompleteAttendanceSessionCommand` | `attendance_session.completed` |
| `MarkAttendanceCommand` | `attendance_record.marked` |
| `BulkMarkAttendanceCommand` | `attendance_record.marked` (one entry per record, or one summary entry) |
| `UpdateAttendanceRecordCommand` | `attendance_record.updated` |
| `CreateAttendanceJustificationCommand` | `attendance_justification.created` |
| `ApproveAttendanceJustificationCommand` | `attendance_justification.approved` |
| `RejectAttendanceJustificationCommand` | `attendance_justification.rejected` |

---

## Timeline Entries (via StudentTimelineEventHandler)

| Domain Event | Timeline Entry | Visible to Student |
|---|---|---|
| `attendance.justification_approved` | `ATTENDANCE_JUSTIFICATION_APPROVED` | Yes |
| `attendance.justification_rejected` | `ATTENDANCE_JUSTIFICATION_REJECTED` | Yes |
| `attendance.student_at_risk` | `ATTENDANCE_AT_RISK` | No (internal) |
| `attendance.student_below_required` | `ATTENDANCE_BELOW_REQUIRED` | No (internal) |

---

## Notifications (via CommunicationEventHandler)

| Domain Event | Notification type | Sent to |
|---|---|---|
| `attendance.student_at_risk` | `ATTENDANCE_RISK` | Student (in-app) |
| `attendance.student_below_required` | `ATTENDANCE_BELOW_REQUIRED` | Student (in-app) |
| `attendance.justification_approved` | `ATTENDANCE_JUSTIFICATION_APPROVED` | Student (in-app) |
| `attendance.justification_rejected` | `ATTENDANCE_JUSTIFICATION_REJECTED` | Student (in-app) |
