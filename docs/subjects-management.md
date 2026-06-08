# Subjects Management

## Overview

A `Subject` is a global, reusable discipline owned by the organization. Subjects can be assigned to course levels via `LevelSubject`, taught by teachers via `TeacherSubject`, and now contain reusable lesson content via `SubjectLesson`.

---

## Domain Model

```
Organization
  └── Subject
        ├── LevelSubject[]     — assigned to course levels
        ├── TeacherSubject[]   — assigned to teachers
        └── SubjectLesson[]    — lessons assigned to this subject
```

---

## Subject vs LevelSubject

| Concept | Purpose |
|---|---|
| `Subject` | Global discipline definition (name, code, description) |
| `LevelSubject` | Junction: Subject × CourseLevel with curriculum-specific rules (hours, passing grade, order) |

The same `Subject` (e.g., "Código da Estrada") can appear in multiple course levels with different workload hours or passing grades.

---

## Subject vs SubjectLesson

| Concept | Purpose |
|---|---|
| `Lesson` | Reusable content unit owned by the organization |
| `SubjectLesson` | Junction: Subject × Lesson with subject-specific rules |

The same `Lesson` (e.g., "Introdução às Regras de Trânsito") can be shared across multiple subjects. Instructors build lessons once and assign them wherever relevant.

See [lessons-management.md](./lessons-management.md) for the full lesson architecture.

---

## Subject Detail Page

`/subjects/[subjectId]` renders a tabbed layout:

- **Informação** — subject metadata (name, code, status, dates)
- **Lições** — lessons assigned to this subject via `SubjectLesson`

The Lessons tab renders `SubjectLessonsPanel`, which allows:
- Listing assigned lessons with order, type, required status, and min watch %
- Assigning published lessons from the library
- Configuring per-assignment rules (isRequired, minWatchPercentage)
- Reordering lessons within the subject
- Removing lessons from the subject

The tab is only visible when the user has `subjectLessons.view` permission.

---

## Routes

| Route | Description |
|---|---|
| `GET /subjects` | Global subjects list |
| `GET /subjects/[subjectId]` | Subject detail |
| `GET /subjects/[subjectId]?tab=lessons` | Subject detail — Lessons tab active |

---

## Tenant Isolation

- Subjects are scoped to `organizationId`.
- `SubjectLesson` records are also scoped to `organizationId`.
- Permissions are resolved from the authenticated session — no `organizationId` from client input.
