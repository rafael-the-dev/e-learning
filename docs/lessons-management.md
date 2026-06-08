# Lessons Management

## Overview

Lessons are **reusable content units** that belong to the organization — not directly to any subject. A lesson can be assigned to multiple subjects through the `SubjectLesson` junction table.

This design mirrors how `ScheduleSlot` works: created once, reused across many contexts.

---

## Domain Model

### Lesson

Reusable content created and owned by the organization.

```
Organization
  └── Lesson (1:N)
        └── LessonAttachment (1:N)
```

A `Lesson` has no `subjectId`. It belongs to `organizationId` only.

**Key fields:**
- `lessonType` — VIDEO, TEXT, LIVE, PRACTICAL, READING, ASSIGNMENT_PREP
- `videoProvider` — where the video is hosted (YouTube, Vimeo, Cloudflare Stream, etc.)
- `externalVideoId` — the provider-specific ID (e.g., YouTube video ID)
- `status` — DRAFT → PUBLISHED → ARCHIVED (one-way transitions from DRAFT)

### SubjectLesson

Junction table linking a `Subject` to a `Lesson`. Contains subject-specific configuration.

```
Subject
  └── SubjectLesson (junction)
        └── Lesson (shared)
```

**Key fields:**
- `order` — display order within the subject (unique per subject)
- `isRequired` — whether the lesson is mandatory for subject completion
- `minWatchPercentage` — minimum % of video the student must watch (0–100)
- `unlockAfterLessonId` — optional prerequisite (another SubjectLesson)

**Constraints:**
- A lesson cannot be assigned twice to the same subject (`UNIQUE subjectId + lessonId`)
- `order` is unique per subject (`UNIQUE subjectId + order`)

### LessonAttachment

Files attached to a lesson (PDFs, documents, images, etc.).

### StudentLessonProgress

Tracks per-student, per-enrollment progress for each lesson.

```
Student → Enrollment → SubjectLesson → StudentLessonProgress
```

**Status flow:** NOT_STARTED → IN_PROGRESS → COMPLETED

---

## Why Lesson Does Not Have subjectId

If `Lesson` had a `subjectId`, the same content (e.g., "Introduction to Road Signs") could not be shared across multiple subjects or courses. By keeping lessons in a shared library, instructors create content once and reuse it across any subject.

---

## Video Loading Strategy

- **Lesson list**: Video is **never loaded**. Only metadata is shown (provider, external ID).
- **Lesson detail page** (`/lessons/[lessonId]`): Video metadata is displayed with a link. Full player embedding is deferred to a future implementation once signed URL support is added.
- **Architecture**: `videoProvider + externalVideoId + videoUrl` are stored separately. The system is ready for signed URL generation per provider.

---

## Progress Tracking

Progress is only valid when the student has an **ACTIVE enrollment**. The `UpdateLessonProgressCommand` enforces:

1. `enrollment.status === "ACTIVE"` and `enrollment.organizationId === context.organizationId`
2. `lesson.status === "PUBLISHED"` — students cannot track progress on drafts
3. Progress is upserted by `(studentId, enrollmentId, lessonId)` unique key

Progress percentage ≥ 100 automatically sets status to `COMPLETED`.

---

## Permissions

| Permission | Description |
|---|---|
| `lessons.view` | View lesson library |
| `lessons.create` | Create new lessons |
| `lessons.update` | Edit lesson metadata |
| `lessons.publish` | Publish a DRAFT lesson |
| `lessons.archive` | Archive a lesson |
| `lessons.delete` | Soft-delete a lesson |
| `lessonAttachments.view` | View lesson attachments |
| `lessonAttachments.create` | Upload attachments |
| `lessonAttachments.delete` | Remove attachments |
| `subjectLessons.view` | View assigned lessons on a subject |
| `subjectLessons.assign` | Assign a lesson to a subject |
| `subjectLessons.update` | Configure isRequired / minWatchPercentage |
| `subjectLessons.remove` | Remove a lesson from a subject |
| `subjectLessons.reorder` | Change lesson order within a subject |
| `lessonProgress.view` | View progress records |
| `lessonProgress.update` | Update own progress (students) |

### Role Matrix

| Role | Lessons | Attachments | SubjectLessons | Progress |
|---|---|---|---|---|
| ORG_ADMIN | All | All | All | All |
| TEACHER | view, create, update | view, create, delete | view, assign, update | — |
| SECRETARY | view | view | view | — |
| STUDENT | — | — | — | view + update (own) |

---

## Tenant Isolation

- `organizationId` **never comes from client input**. It is always resolved from `requireOrganization()`.
- Every query filters by `organizationId`.
- `lessonId`, `subjectId`, `enrollmentId`, `studentId` are all validated against `organizationId` in commands before use.

---

## Routes

| Route | Description |
|---|---|
| `GET /lessons` | Lesson library with filters and pagination |
| `GET /lessons/new` | Create lesson form |
| `GET /lessons/[lessonId]` | Lesson detail (metadata, video link, attachments, subject usages) |
| `GET /lessons/[lessonId]/edit` | Edit lesson form |
| `GET /subjects/[subjectId]?tab=lessons` | Subject detail with Lessons tab |

---

## File Structure

```
src/modules/lessons/
├── actions/
│   ├── lesson.actions.ts
│   ├── lesson-attachment.actions.ts
│   ├── lesson-progress.actions.ts
│   └── subject-lesson.actions.ts
├── commands/
│   ├── create-lesson.command.ts
│   ├── update-lesson.command.ts
│   ├── publish-lesson.command.ts
│   ├── archive-lesson.command.ts
│   ├── soft-delete-lesson.command.ts
│   ├── create-lesson-attachment.command.ts
│   ├── delete-lesson-attachment.command.ts
│   ├── assign-lesson-to-subject.command.ts
│   ├── update-subject-lesson.command.ts
│   ├── remove-lesson-from-subject.command.ts
│   ├── reorder-subject-lessons.command.ts
│   └── update-lesson-progress.command.ts
├── components/
│   ├── lesson-columns.tsx
│   ├── lesson-detail-actions.tsx
│   ├── lesson-form.tsx
│   ├── lessons-table.tsx
│   ├── subject-lesson-columns.tsx
│   ├── subject-lesson-form.tsx
│   └── subject-lessons-panel.tsx
├── repositories/
│   ├── lesson.repository.ts
│   ├── lesson-attachment.repository.ts
│   ├── lesson-progress.repository.ts
│   └── subject-lesson.repository.ts
├── schemas/
│   ├── lesson.schema.ts
│   ├── lesson-attachment.schema.ts
│   └── subject-lesson.schema.ts
├── services/
│   └── lesson.service.ts
└── types/
    └── index.ts
```
