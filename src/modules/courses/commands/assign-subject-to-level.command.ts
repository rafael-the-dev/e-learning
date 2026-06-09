import {
  BaseCommand,
  AuthorizationError,
  ValidationError,
  NotFoundError,
  BusinessRuleError,
} from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { findCourseByIdInOrganization } from "@/modules/courses/repositories/course.repository";
import { findLevelByIdInOrganization } from "@/modules/courses/repositories/level.repository";
import { findSubjectByIdInOrganization } from "@/modules/courses/repositories/subject.repository";
import {
  createLevelSubject,
  existsLevelSubjectLink,
  isOrderTakenInLevel,
  getNextOrderInLevel,
} from "@/modules/courses/repositories/level-subject.repository";
import {
  assignSubjectSchema,
  type AssignSubjectSchema,
} from "@/modules/courses/schemas/level-subject.schema";
import type { LevelSubject } from "@/modules/courses/types";

interface AssignSubjectInput extends AssignSubjectSchema {
  courseId: string;
  courseLevelId: string;
}

export class AssignSubjectToLevelCommand extends BaseCommand<AssignSubjectInput, LevelSubject> {
  async validate(): Promise<void> {
    const result = assignSubjectSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    const course = await findCourseByIdInOrganization(
      this.input.courseId,
      this.context.organizationId
    );
    if (!course) throw new NotFoundError("Curso", this.input.courseId);

    const level = await findLevelByIdInOrganization(
      this.input.courseLevelId,
      this.context.organizationId
    );
    if (!level) throw new NotFoundError("Nível", this.input.courseLevelId);
    if (level.courseId !== this.input.courseId) {
      throw new ValidationError("Dados inválidos", {
        courseLevelId: ["O nível não pertence ao curso indicado"],
      });
    }

    const subject = await findSubjectByIdInOrganization(
      this.input.subjectId,
      this.context.organizationId
    );
    if (!subject) throw new NotFoundError("Disciplina", this.input.subjectId);

    const alreadyLinked = await existsLevelSubjectLink(
      this.input.courseLevelId,
      this.input.subjectId,
      this.context.organizationId
    );
    if (alreadyLinked) {
      throw new BusinessRuleError("Esta disciplina já está associada a este nível");
    }

    if (this.input.order !== undefined) {
      const orderTaken = await isOrderTakenInLevel(
        this.input.courseLevelId,
        this.input.order
      );
      if (orderTaken) {
        throw new ValidationError("Dados inválidos", {
          order: ["Esta posição já está ocupada neste nível"],
        });
      }
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(
      this.context.userId,
      this.context.organizationId
    );
    if (!createAbility(perms).can(PERMISSIONS.LEVEL_SUBJECTS_ASSIGN)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<LevelSubject> {
    const order =
      this.input.order !== undefined
        ? this.input.order
        : await getNextOrderInLevel(this.input.courseLevelId);

    const levelSubject = await createLevelSubject({
      organizationId: this.context.organizationId,
      courseId: this.input.courseId,
      courseLevelId: this.input.courseLevelId,
      subjectId: this.input.subjectId,
      order,
      workloadHours: this.input.workloadHours ?? null,
      theoryHours: this.input.theoryHours ?? null,
      practicalHours: this.input.practicalHours ?? null,
      minimumPassingGrade: this.input.minimumPassingGrade ?? null,
      minimumAttendancePercentage: this.input.minimumAttendancePercentage ?? null,
      maxAbsences: this.input.maxAbsences ?? null,
      isRequired: this.input.isRequired,
      allowRetakeExam: this.input.allowRetakeExam,
      allowCompensation: this.input.allowCompensation,
      certificateRequired: this.input.certificateRequired,
      status: this.input.status,
    });

    await auditService.log(this.context, {
      entity: "LevelSubject",
      entityId: levelSubject.id,
      action: "level_subject.assigned",
      newValues: {
        courseLevelId: levelSubject.courseLevelId,
        subjectId: levelSubject.subjectId,
        order: levelSubject.order,
        workloadHours: levelSubject.workloadHours,
        isRequired: levelSubject.isRequired,
        certificateRequired: levelSubject.certificateRequired,
      },
    });

    return levelSubject;
  }
}
