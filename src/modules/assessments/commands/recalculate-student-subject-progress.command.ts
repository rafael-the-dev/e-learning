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
import { getDb } from "@/server/db";
import {
  recalculateStudentSubjectProgressSchema,
  type RecalculateStudentSubjectProgressSchema,
} from "@/modules/assessments/schemas/assessment.schema";
import type { StudentSubjectProgress } from "@/modules/assessments/types";
import { recalculateSubjectProgressCascade } from "@/modules/grades/services/subject-progress-cascade.service";
import { eventPublisher } from "@/server/events/event-publisher";
import type { DomainEvent } from "@/server/events/domain-event";

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
    // Single canonical recalculation path. Always cascades subject -> level ->
    // course, atomically: subject/level/course progress commit together or not
    // at all. Events publish only after commit.
    const db = await getDb();
    const events: DomainEvent[] = [];
    const progress = await db.$transaction((tx) =>
      recalculateSubjectProgressCascade(
        this.context as AuthContext,
        {
          studentId: this.input.studentId,
          enrollmentId: this.input.enrollmentId,
          levelSubjectId: this.input.levelSubjectId,
        },
        { client: tx, events }
      )
    );

    for (const event of events) await eventPublisher.publish(event);

    return progress;
  }
}
