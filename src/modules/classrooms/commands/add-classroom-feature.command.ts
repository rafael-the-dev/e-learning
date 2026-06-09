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
import { findClassroomById } from "@/modules/classrooms/repositories/classroom.repository";
import {
  findFeatureByClassroomAndType,
  createClassroomFeature,
} from "@/modules/classrooms/repositories/classroom-feature.repository";
import {
  addClassroomFeatureSchema,
  type AddClassroomFeatureSchema,
} from "@/modules/classrooms/schemas/classroom-feature.schema";
import type { ClassroomFeature } from "@/modules/classrooms/types";

export class AddClassroomFeatureCommand extends BaseCommand<AddClassroomFeatureSchema, ClassroomFeature> {
  async validate(): Promise<void> {
    const result = addClassroomFeatureSchema.safeParse(this.input);
    if (!result.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = [];
        fieldErrors[key].push(issue.message);
      }
      throw new ValidationError("Dados inválidos", fieldErrors);
    }

    const classroom = await findClassroomById(this.input.classroomId, this.context.organizationId);
    if (!classroom) throw new NotFoundError("Sala", this.input.classroomId);

    const existing = await findFeatureByClassroomAndType(this.input.classroomId, this.input.feature);
    if (existing) throw new BusinessRuleError("Esta funcionalidade já foi adicionada a esta sala.");
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.CLASSROOM_FEATURES_MANAGE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<ClassroomFeature> {
    const feature = await createClassroomFeature({
      organizationId: this.context.organizationId,
      classroomId: this.input.classroomId,
      feature: this.input.feature,
    });

    await auditService.log(this.context, {
      entity: "ClassroomFeature",
      entityId: feature.id,
      action: "classroom_feature.added",
      newValues: { classroomId: this.input.classroomId, feature: this.input.feature },
    });

    return feature;
  }
}
