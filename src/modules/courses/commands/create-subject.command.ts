import {
  BaseCommand,
  AuthorizationError,
  ValidationError,
  NotFoundError,
} from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { createSubject } from "@/modules/courses/repositories/subject.repository";
import { findLevelByIdInOrganization } from "@/modules/courses/repositories/level.repository";
import { findCourseByIdInOrganization } from "@/modules/courses/repositories/course.repository";
import {
  createSubjectSchema,
  type CreateSubjectSchema,
} from "@/modules/courses/schemas/subject.schema";
import type { Subject } from "@/modules/courses/types";

// courseId is injected server-side from the URL param, not from the client schema
interface CreateSubjectInput extends CreateSubjectSchema {
  courseId: string;
}

export class CreateSubjectCommand extends BaseCommand<
  CreateSubjectInput,
  Subject
> {
  async validate(): Promise<void> {
    const result = createSubjectSchema.safeParse(this.input);
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
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(
      this.context.userId,
      this.context.organizationId
    );
    if (!createAbility(perms).can(PERMISSIONS.SUBJECTS_CREATE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<Subject> {
    const subject = await createSubject({
      courseLevelId: this.input.courseLevelId,
      name: this.input.name,
      code: this.input.code || null,
      description: this.input.description || null,
      hoursRequired: this.input.hoursRequired
        ? parseInt(this.input.hoursRequired, 10)
        : null,
      order: this.input.order ? parseInt(this.input.order, 10) : undefined,
    });

    await auditService.log(this.context, {
      entity: "Subject",
      entityId: subject.id,
      action: "subject.created",
      newValues: {
        name: subject.name,
        courseLevelId: subject.courseLevelId,
        organizationId: this.context.organizationId,
      },
    });

    return subject;
  }
}
