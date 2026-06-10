import {
  BaseCommand,
  AuthorizationError,
  ValidationError,
  NotFoundError,
} from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { eventPublisher } from "@/server/events/event-publisher";
import { DomainEventType, DomainAggregateType } from "@/server/events/event-types";
import { getDb } from "@/server/db";
import {
  findResultsByEnrollmentAndLevelSubject,
} from "@/modules/assessments/repositories/assessment-result.repository";
import { upsertStudentSubjectProgress } from "@/modules/assessments/repositories/student-subject-progress.repository";
import { findActivePolicyForLevelSubject } from "@/modules/assessments/repositories/assessment-policy.repository";
import { findActiveComponentsByPolicy } from "@/modules/assessments/repositories/assessment-component.repository";
import {
  gradeCalculatorService,
  type ComponentScore,
} from "@/modules/assessments/services/grade-calculator.service";
import {
  recalculateStudentSubjectProgressSchema,
  type RecalculateStudentSubjectProgressSchema,
} from "@/modules/assessments/schemas/assessment.schema";
import type { StudentSubjectProgress } from "@/modules/assessments/types";

export class RecalculateStudentSubjectProgressCommand extends BaseCommand<
  RecalculateStudentSubjectProgressSchema,
  StudentSubjectProgress
> {
  async validate(): Promise<void> {
    const result = recalculateStudentSubjectProgressSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    const db = await getDb();
    const { organizationId } = this.context;

    const student = await db.student.findFirst({
      where: { id: this.input.studentId, organizationId, deletedAt: null },
    });
    if (!student) throw new NotFoundError("Aluno", this.input.studentId);

    const enrollment = await db.enrollment.findFirst({
      where: { id: this.input.enrollmentId, organizationId, deletedAt: null },
    });
    if (!enrollment) throw new NotFoundError("Matrícula", this.input.enrollmentId);

    const levelSubject = await db.levelSubject.findFirst({
      where: { id: this.input.levelSubjectId, organizationId, deletedAt: null },
    });
    if (!levelSubject) throw new NotFoundError("Configuração de disciplina", this.input.levelSubjectId);
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.ASSESSMENT_RESULTS_GRADE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<StudentSubjectProgress> {
    const { organizationId } = this.context;
    const { studentId, enrollmentId, levelSubjectId } = this.input;

    const db = await getDb();
    const levelSubject = await db.levelSubject.findFirst({
      where: { id: levelSubjectId, organizationId },
      select: {
        minimumPassingGrade: true,
        minimumAttendancePercentage: true,
      },
    });

    const policy = await findActivePolicyForLevelSubject(levelSubjectId, organizationId);
    const components = policy
      ? await findActiveComponentsByPolicy(policy.id, organizationId)
      : [];

    const results = await findResultsByEnrollmentAndLevelSubject(
      enrollmentId,
      levelSubjectId,
      organizationId
    );

    // Build component scores map
    const componentScores: ComponentScore[] = components.map((comp) => {
      const matchingResult = (results as any[]).find(
        (r: any) => r.assessment?.assessmentComponentId === comp.id
      );
      return {
        weight: comp.weight,
        normalizedScore: matchingResult?.normalizedScore ?? null,
        isRequired: comp.isRequired,
      };
    });

    // Get attendance from existing progress or calculate
    const attendancePercentage: number | null = null;

    const minPassingGrade =
      policy?.minimumPassingGrade ??
      (levelSubject?.minimumPassingGrade ? Number(levelSubject.minimumPassingGrade) : 50);

    const minAttendance = levelSubject?.minimumAttendancePercentage
      ? Number(levelSubject.minimumAttendancePercentage)
      : null;

    let calculationResult;
    if (policy && components.length > 0) {
      calculationResult = gradeCalculatorService.calculateFinalGrade({
        calculationMethod: policy.calculationMethod,
        roundingMethod: policy.roundingMethod,
        minimumPassingGrade: minPassingGrade,
        allowRetake: policy.allowRetake,
        components: componentScores,
        attendancePercentage,
        minimumAttendancePercentage: minAttendance,
      });
    } else {
      calculationResult = {
        finalGrade: null,
        status: "IN_PROGRESS" as const,
        reason: "Sem política de avaliação configurada",
      };
    }

    const progressStatus =
      calculationResult.status === "PASSED" ? "PASSED" :
      calculationResult.status === "FAILED" ? "FAILED" :
      calculationResult.status === "INCOMPLETE" ? "INCOMPLETE" :
      calculationResult.status === "BLOCKED" ? "BLOCKED" :
      "IN_PROGRESS";

    const progress = await upsertStudentSubjectProgress({
      organizationId,
      studentId,
      enrollmentId,
      levelSubjectId,
      finalGrade: calculationResult.finalGrade,
      attendancePercentage,
      status: progressStatus,
      progressReason: calculationResult.reason,
      completedAt:
        progressStatus === "PASSED" || progressStatus === "FAILED" ? new Date() : null,
    });

    await auditService.log(this.context, {
      entity: "StudentSubjectProgress",
      entityId: progress.id,
      action: "student_subject_progress.updated",
      newValues: {
        studentId,
        levelSubjectId,
        finalGrade: progress.finalGrade,
        status: progress.status,
      },
    });

    // Emit domain events for terminal states
    if (progressStatus === "PASSED") {
      await eventPublisher.publish({
        organizationId,
        eventType: DomainEventType.STUDENT_SUBJECT_PASSED,
        aggregateType: DomainAggregateType.STUDENT,
        aggregateId: studentId,
        actorId: this.context.userId,
        payload: {
          studentId,
          enrollmentId,
          levelSubjectId,
          finalGrade: progress.finalGrade,
          progressId: progress.id,
        },
      });
    } else if (progressStatus === "FAILED") {
      await eventPublisher.publish({
        organizationId,
        eventType: DomainEventType.STUDENT_SUBJECT_FAILED,
        aggregateType: DomainAggregateType.STUDENT,
        aggregateId: studentId,
        actorId: this.context.userId,
        payload: {
          studentId,
          enrollmentId,
          levelSubjectId,
          finalGrade: progress.finalGrade,
          progressId: progress.id,
        },
      });
    }

    return progress;
  }
}
