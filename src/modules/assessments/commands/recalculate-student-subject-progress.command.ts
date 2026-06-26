import {
  BaseCommand,
  AuthorizationError,
  ValidationError,
  NotFoundError,
} from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { assertTeacherCanAccessEnrollment } from "@/server/auth/teacher-access";
import type { AuthContext } from "@/server/auth/context";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { eventPublisher } from "@/server/events/event-publisher";
import { DomainEventType, DomainAggregateType } from "@/server/events/event-types";
import { getDb } from "@/server/db";
import { findResultsByEnrollmentAndLevelSubject } from "@/modules/grades/repositories/student-assessment-result.repository";
import { upsertStudentSubjectProgress } from "@/modules/assessments/repositories/student-subject-progress.repository";
import { findActivePolicyForLevelSubject } from "@/modules/assessments/repositories/assessment-policy.repository";
import { findActiveComponentsByPolicy } from "@/modules/assessments/repositories/assessment-component.repository";
import {
  gradeCalculationService,
  type GradeComponentScore,
} from "@/modules/grades/services/grade-calculation.service";
import {
  recalculateStudentSubjectProgressSchema,
  type RecalculateStudentSubjectProgressSchema,
} from "@/modules/assessments/schemas/assessment.schema";
import type { StudentSubjectProgress } from "@/modules/assessments/types";
import { recalculateStudentLevelProgress } from "@/modules/prerequisites/services/recalculate-level-progress.service";

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
    // Defense-in-depth: a teacher-scoped user may only recalculate progress for an
    // enrollment in a class group they teach. No-op for admins/secretaries.
    await assertTeacherCanAccessEnrollment(this.context as AuthContext, this.input.enrollmentId);
  }

  async execute(): Promise<StudentSubjectProgress> {
    const { organizationId } = this.context;
    const { studentId, enrollmentId, levelSubjectId } = this.input;

    const db = await getDb();
    const levelSubject = await db.levelSubject.findFirst({
      where: { id: levelSubjectId, organizationId },
      select: { minimumPassingGrade: true, minimumAttendancePercentage: true, courseLevelId: true },
    });

    const policy = await findActivePolicyForLevelSubject(levelSubjectId, organizationId);
    const components = policy
      ? await findActiveComponentsByPolicy(policy.id, organizationId)
      : [];

    // Read from unified StudentAssessmentResult (single source of truth)
    const results = await findResultsByEnrollmentAndLevelSubject(
      enrollmentId,
      levelSubjectId,
      organizationId
    );

    const componentScores: GradeComponentScore[] = components.map((comp) => {
      const matching = results.find((r) => r.assessmentComponentId === comp.id);
      return {
        componentId: comp.id,
        weight: comp.weight,
        maxGrade: comp.maxGrade,
        grade: matching?.grade ?? null,
        normalizedGrade: matching?.normalizedGrade ?? null,
        isRequired: comp.isRequired,
      };
    });

    const minPassingGrade =
      levelSubject?.minimumPassingGrade != null
        ? Number(levelSubject.minimumPassingGrade)
        : policy?.minimumPassingGrade ?? 50;

    const minAttendance = levelSubject?.minimumAttendancePercentage
      ? Number(levelSubject.minimumAttendancePercentage)
      : null;

    let calculationResult;
    if (policy && components.length > 0) {
      calculationResult = gradeCalculationService.calculateFinalGrade({
        calculationMethod: policy.calculationMethod,
        roundingMethod: policy.roundingMethod,
        minimumPassingGrade: minPassingGrade,
        allowRecovery: policy.allowRecovery,
        components: componentScores,
        attendancePercentage: null,
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
      calculationResult.status === "RECOVERY_REQUIRED" ? "FAILED" :
      calculationResult.status === "INCOMPLETE" ? "INCOMPLETE" :
      calculationResult.status === "BLOCKED" ? "BLOCKED" :
      "IN_PROGRESS";

    const isTerminal = progressStatus === "PASSED" || progressStatus === "FAILED";

    const progress = await upsertStudentSubjectProgress({
      organizationId,
      studentId,
      enrollmentId,
      levelSubjectId,
      finalGrade: calculationResult.finalGrade,
      attendancePercentage: null,
      status: progressStatus,
      progressReason: calculationResult.reason,
      completedAt: isTerminal ? new Date() : null,
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

    // Cascade: subject progress → level progress → course progress
    if (levelSubject?.courseLevelId) {
      await recalculateStudentLevelProgress(enrollmentId, levelSubject.courseLevelId, organizationId);
    }

    if (progressStatus === "PASSED") {
      await eventPublisher.publish({
        organizationId,
        eventType: DomainEventType.STUDENT_SUBJECT_PASSED,
        aggregateType: DomainAggregateType.STUDENT,
        aggregateId: studentId,
        actorId: this.context.userId,
        payload: { studentId, enrollmentId, levelSubjectId, finalGrade: progress.finalGrade, progressId: progress.id },
      });
    } else if (progressStatus === "FAILED") {
      await eventPublisher.publish({
        organizationId,
        eventType: DomainEventType.STUDENT_SUBJECT_FAILED,
        aggregateType: DomainAggregateType.STUDENT,
        aggregateId: studentId,
        actorId: this.context.userId,
        payload: { studentId, enrollmentId, levelSubjectId, finalGrade: progress.finalGrade, progressId: progress.id },
      });
    }

    return progress;
  }
}
