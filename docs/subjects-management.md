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
| `Subject` | Global discipline definition (name, code, description). Org-scoped, reusable. |
| `LevelSubject` | Academic rule engine: Subject × CourseLevel with all context-specific rules |

The same `Subject` (e.g., "Código da Estrada") can appear in multiple course levels with completely different rules.

### What lives in LevelSubject (not in Subject)

| Rule | Field | Why it belongs to LevelSubject |
|---|---|---|
| Workload | `workloadHours`, `theoryHours`, `practicalHours` | Hours vary per level (theory-heavy vs practical-heavy) |
| Academic approval | `minimumPassingGrade` | The passing threshold differs per level |
| Attendance | `minimumAttendancePercentage`, `maxAbsences` | Attendance rules differ per level |
| Curriculum | `isRequired`, `order` | A subject may be mandatory in one level and optional in another |
| Progression | `allowRetakeExam`, `allowCompensation` | Retake and compensation policies are level-specific |
| Certification | `certificateRequired` | A subject may only be required for certificate in certain levels |

### Future module dependencies

| Module | LevelSubject fields used |
|---|---|
| **Attendance** | `minimumAttendancePercentage`, `maxAbsences` — eligibility gating |
| **Assessments** | `minimumPassingGrade`, `allowRetakeExam` — pass/fail and retake logic |
| **Progression** | `isRequired`, `allowCompensation` — level completion rules |
| **Certificates** | `certificateRequired` — gates certificate issuance |

> These modules are **not yet implemented**. LevelSubject stores the rules that will drive them.

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
