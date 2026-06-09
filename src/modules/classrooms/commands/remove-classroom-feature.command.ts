import {
  BaseCommand,
  AuthorizationError,
  NotFoundError,
} from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { findClassroomById } from "@/modules/classrooms/repositories/classroom.repository";
import {
  findFeaturesByClassroom,
  deleteClassroomFeature,
} from "@/modules/classrooms/repositories/classroom-feature.repository";
import type { RemoveClassroomFeatureSchema } from "@/modules/classrooms/schemas/classroom-feature.schema";

export class RemoveClassroomFeatureCommand extends BaseCommand<RemoveClassroomFeatureSchema, void> {
  async validate(): Promise<void> {
    const classroom = await findClassroomById(this.input.classroomId, this.context.organizationId);
    if (!classroom) throw new NotFoundError("Sala", this.input.classroomId);

    const features = await findFeaturesByClassroom(this.input.classroomId, this.context.organizationId);
    const exists = features.some((f) => f.id === this.input.featureId);
    if (!exists) throw new NotFoundError("Funcionalidade", this.input.featureId);
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.CLASSROOM_FEATURES_MANAGE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<void> {
    await deleteClassroomFeature(this.input.featureId, this.context.organizationId);

    await auditService.log(this.context, {
      entity: "ClassroomFeature",
      entityId: this.input.featureId,
      action: "classroom_feature.removed",
      newValues: { classroomId: this.input.classroomId },
    });
  }
}
