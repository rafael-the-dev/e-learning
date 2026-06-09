import {
  BaseCommand,
  AuthorizationError,
  NotFoundError,
} from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import {
  findClassroomById,
  archiveClassroom,
} from "@/modules/classrooms/repositories/classroom.repository";

type Input = { classroomId: string };

export class ArchiveClassroomCommand extends BaseCommand<Input, void> {
  async validate(): Promise<void> {
    const classroom = await findClassroomById(this.input.classroomId, this.context.organizationId);
    if (!classroom) throw new NotFoundError("Sala", this.input.classroomId);
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.CLASSROOMS_ARCHIVE)) {
      throw new AuthorizationError();
    }
  }

  async execute(): Promise<void> {
    await archiveClassroom(this.input.classroomId, this.context.organizationId);

    await auditService.log(this.context, {
      entity: "Classroom",
      entityId: this.input.classroomId,
      action: "classroom.archived",
    });
  }
}
