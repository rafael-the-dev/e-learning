import { getDb } from "@/server/db";
import type { DomainEventHandler } from "../event-handlers";
import type { PersistedDomainEvent } from "../domain-event";
import { DomainEventType } from "../event-types";
import {
  createTimelineEvent,
  findTimelineEventBySourceAndType,
} from "@/modules/student-timeline/repositories/student-timeline.repository";
import {
  TIMELINE_EVENT_DEFAULT_VISIBILITY,
  TIMELINE_EVENT_TYPE,
} from "@/modules/student-timeline/types";

// =============================================================================
// ASSESSMENT EVENT HANDLER
// Writes student timeline entries and in-app notifications for assessment events.
// All handlers are idempotent via (sourceEventId + timelineEventType) check.
// =============================================================================

const HANDLED_EVENTS = new Set<string>([
  DomainEventType.ASSESSMENT_RESULTS_PUBLISHED,
  DomainEventType.STUDENT_SUBJECT_PASSED,
  DomainEventType.STUDENT_SUBJECT_FAILED,
]);

export class AssessmentEventHandler implements DomainEventHandler {
  readonly handlerName = "AssessmentEventHandler";

  canHandle(event: PersistedDomainEvent): boolean {
    return HANDLED_EVENTS.has(event.eventType);
  }

  async handle(event: PersistedDomainEvent): Promise<void> {
    const payload = event.payload as Record<string, unknown>;

    switch (event.eventType) {
      case DomainEventType.ASSESSMENT_RESULTS_PUBLISHED:
        await this.handleResultsPublished(event, payload);
        break;
      case DomainEventType.STUDENT_SUBJECT_PASSED:
        await this.handleSubjectPassed(event, payload);
        break;
      case DomainEventType.STUDENT_SUBJECT_FAILED:
        await this.handleSubjectFailed(event, payload);
        break;
    }
  }

  private async handleResultsPublished(
    event: PersistedDomainEvent,
    payload: Record<string, unknown>
  ): Promise<void> {
    const db = await getDb();
    const assessmentId = payload.assessmentId as string | undefined;
    if (!assessmentId) return;

    // Fetch all graded results + assessment title in one query
    const results = await db.assessmentResult.findMany({
      where: {
        assessmentId,
        organizationId: event.organizationId,
        deletedAt: null,
        status: "GRADED",
      },
      select: {
        id: true,
        studentId: true,
        normalizedScore: true,
      },
    });

    const assessment = await db.assessment.findFirst({
      where: { id: assessmentId, organizationId: event.organizationId },
      select: {
        title: true,
        assessmentPeriod: { select: { name: true } },
      },
    });

    const assessmentTitle = assessment?.title ?? "Avaliação";
    const periodName = assessment?.assessmentPeriod?.name;

    for (const result of results) {
      const tlEventType = TIMELINE_EVENT_TYPE.ASSESSMENT_RESULTS_PUBLISHED;
      const sourceKey = `${event.id}_${result.studentId}`;

      const tlExisting = await findTimelineEventBySourceAndType(
        sourceKey,
        tlEventType,
        event.organizationId
      );
      if (tlExisting) continue;

      const grade = result.normalizedScore != null ? Number(result.normalizedScore).toFixed(1) : null;

      await createTimelineEvent({
        organizationId: event.organizationId,
        studentId: result.studentId,
        eventType: tlEventType,
        title: `Resultados publicados: ${assessmentTitle}`,
        description: [
          periodName ? `Período: ${periodName}` : null,
          grade != null ? `Nota: ${grade}` : null,
        ]
          .filter(Boolean)
          .join(" · ") || null,
        referenceType: "ASSESSMENT",
        referenceId: assessmentId,
        sourceEventId: sourceKey,
        actorUserId: event.actorId ?? null,
        visibility:
          TIMELINE_EVENT_DEFAULT_VISIBILITY[tlEventType as keyof typeof TIMELINE_EVENT_DEFAULT_VISIBILITY] ??
          "STUDENT_VISIBLE",
        metadata: {
          assessmentId,
          assessmentResultId: result.id,
          normalizedScore: result.normalizedScore,
        },
        occurredAt: event.occurredAt,
      });
    }
  }

  private async handleSubjectPassed(
    event: PersistedDomainEvent,
    payload: Record<string, unknown>
  ): Promise<void> {
    const db = await getDb();
    const studentId = payload.studentId as string | undefined;
    const levelSubjectId = payload.levelSubjectId as string | undefined;
    if (!studentId || !levelSubjectId) return;

    const tlEventType = TIMELINE_EVENT_TYPE.SUBJECT_PASSED;

    const existing = await findTimelineEventBySourceAndType(
      event.id,
      tlEventType,
      event.organizationId
    );
    if (existing) return;

    const levelSubject = await db.levelSubject.findFirst({
      where: { id: levelSubjectId, organizationId: event.organizationId },
      select: {
        subject: { select: { name: true } },
        courseLevel: { select: { name: true } },
      },
    });

    const subjectName = levelSubject?.subject?.name ?? "Disciplina";
    const finalGrade = payload.finalGrade != null ? Number(payload.finalGrade).toFixed(1) : null;

    await createTimelineEvent({
      organizationId: event.organizationId,
      studentId,
      eventType: tlEventType,
      title: `Aprovado em ${subjectName}`,
      description: [
        levelSubject?.courseLevel?.name ? `Nível: ${levelSubject.courseLevel.name}` : null,
        finalGrade != null ? `Nota final: ${finalGrade}` : null,
      ]
        .filter(Boolean)
        .join(" · ") || null,
      referenceType: "ASSESSMENT",
      referenceId: levelSubjectId,
      sourceEventId: event.id,
      actorUserId: event.actorId ?? null,
      visibility:
        TIMELINE_EVENT_DEFAULT_VISIBILITY[tlEventType as keyof typeof TIMELINE_EVENT_DEFAULT_VISIBILITY] ??
        "STUDENT_VISIBLE",
      metadata: {
        levelSubjectId,
        enrollmentId: payload.enrollmentId,
        finalGrade: payload.finalGrade,
        progressId: payload.progressId,
      },
      occurredAt: event.occurredAt,
    });
  }

  private async handleSubjectFailed(
    event: PersistedDomainEvent,
    payload: Record<string, unknown>
  ): Promise<void> {
    const db = await getDb();
    const studentId = payload.studentId as string | undefined;
    const levelSubjectId = payload.levelSubjectId as string | undefined;
    if (!studentId || !levelSubjectId) return;

    const tlEventType = TIMELINE_EVENT_TYPE.SUBJECT_FAILED;

    const existing = await findTimelineEventBySourceAndType(
      event.id,
      tlEventType,
      event.organizationId
    );
    if (existing) return;

    const levelSubject = await db.levelSubject.findFirst({
      where: { id: levelSubjectId, organizationId: event.organizationId },
      select: {
        subject: { select: { name: true } },
        courseLevel: { select: { name: true } },
      },
    });

    const subjectName = levelSubject?.subject?.name ?? "Disciplina";
    const finalGrade = payload.finalGrade != null ? Number(payload.finalGrade).toFixed(1) : null;

    await createTimelineEvent({
      organizationId: event.organizationId,
      studentId,
      eventType: tlEventType,
      title: `Reprovado em ${subjectName}`,
      description: [
        levelSubject?.courseLevel?.name ? `Nível: ${levelSubject.courseLevel.name}` : null,
        finalGrade != null ? `Nota final: ${finalGrade}` : null,
      ]
        .filter(Boolean)
        .join(" · ") || null,
      referenceType: "ASSESSMENT",
      referenceId: levelSubjectId,
      sourceEventId: event.id,
      actorUserId: event.actorId ?? null,
      visibility:
        TIMELINE_EVENT_DEFAULT_VISIBILITY[tlEventType as keyof typeof TIMELINE_EVENT_DEFAULT_VISIBILITY] ??
        "STUDENT_VISIBLE",
      metadata: {
        levelSubjectId,
        enrollmentId: payload.enrollmentId,
        finalGrade: payload.finalGrade,
        progressId: payload.progressId,
      },
      occurredAt: event.occurredAt,
    });
  }
}
