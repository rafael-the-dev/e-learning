import {
  BaseCommand,
  AuthorizationError,
  ValidationError,
  NotFoundError,
  BusinessRuleError,
} from "@/shared/lib/command";
import { getUserPermissions, createAbility } from "@/server/auth/rbac";
import { PERMISSIONS } from "@/server/auth/permissions";
import { assertTeacherCanAccessClassGroup, resolveAssignedTeacherId } from "@/server/auth/teacher-access";
import type { AuthContext } from "@/server/auth/context";
import { auditService } from "@/modules/audit-logs/services/audit.service";
import { getDb } from "@/server/db";
import { createAttendanceSession } from "@/modules/attendance/repositories/attendance-session.repository";
import {
  createAttendanceSessionSchema,
  type CreateAttendanceSessionSchema,
} from "@/modules/attendance/schemas/attendance.schema";
import type { AttendanceSession } from "@/modules/attendance/types";

export class CreateAttendanceSessionCommand extends BaseCommand<
  CreateAttendanceSessionSchema,
  AttendanceSession
> {
  async validate(): Promise<void> {
    const result = createAttendanceSessionSchema.safeParse(this.input);
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

    // Validate classGroup
    const classGroup = await db.classGroup.findFirst({
      where: { id: this.input.classGroupId, organizationId, deletedAt: null },
    });
    if (!classGroup) throw new NotFoundError("Turma", this.input.classGroupId);
    if (!["FORMING", "ACTIVE"].includes(classGroup.status)) {
      throw new BusinessRuleError("A turma não está ativa.");
    }
    if (classGroup.academicYearId !== this.input.academicYearId) {
      throw new ValidationError("Dados inválidos", {
        classGroupId: ["A turma não pertence ao ano letivo selecionado"],
      });
    }

    // Validate levelSubject belongs to org and matches courseLevelId
    const levelSubject = await db.levelSubject.findFirst({
      where: { id: this.input.levelSubjectId, organizationId, deletedAt: null },
    });
    if (!levelSubject) throw new NotFoundError("Configuração de disciplina", this.input.levelSubjectId);
    if (levelSubject.subjectId !== this.input.subjectId) {
      throw new ValidationError("Dados inválidos", {
        subjectId: ["A disciplina não corresponde à configuração selecionada"],
      });
    }
    if (levelSubject.courseLevelId !== this.input.courseLevelId) {
      throw new ValidationError("Dados inválidos", {
        levelSubjectId: ["A configuração de disciplina não pertence ao nível selecionado"],
      });
    }

    // Validate time range
    if (this.input.startTime >= this.input.endTime) {
      throw new ValidationError("Dados inválidos", {
        endTime: ["A hora de fim deve ser posterior à hora de início"],
      });
    }

    // Validate optional teacher
    if (this.input.teacherId) {
      const teacher = await db.teacher.findFirst({
        where: { id: this.input.teacherId, organizationId, deletedAt: null },
      });
      if (!teacher) throw new NotFoundError("Professor", this.input.teacherId);
    }

    // Validate optional classroom
    if (this.input.classroomId) {
      const classroom = await db.classroom.findFirst({
        where: { id: this.input.classroomId, organizationId, deletedAt: null },
      });
      if (!classroom) throw new NotFoundError("Sala", this.input.classroomId);
    }

    // Validate optional schedule slot
    if (this.input.scheduleSlotId) {
      const slot = await db.scheduleSlot.findFirst({
        where: { id: this.input.scheduleSlotId, organizationId, deletedAt: null },
      });
      if (!slot) throw new NotFoundError("Slot de horário", this.input.scheduleSlotId);
    }
  }

  async authorize(): Promise<void> {
    const perms = await getUserPermissions(this.context.userId, this.context.organizationId);
    if (!createAbility(perms).can(PERMISSIONS.ATTENDANCE_SESSIONS_CREATE)) {
      throw new AuthorizationError();
    }
    // Create-time scope: a teacher-scoped user may only create sessions for a
    // class group they teach (the resolved teacherId, never client input). No-op
    // for admins/secretaries. See docs/teacher-access-scope.md.
    await assertTeacherCanAccessClassGroup(this.context as AuthContext, this.input.classGroupId);
  }

  async execute(): Promise<AttendanceSession> {
    const [startH, startM] = this.input.startTime.split(":").map(Number);
    const [endH, endM] = this.input.endTime.split(":").map(Number);
    const durationMinutes = (endH * 60 + endM) - (startH * 60 + startM);

    // For a teacher-scoped user the assigned teacher is forced to themselves; a
    // client-supplied teacherId is ignored. Admins/secretaries keep their choice.
    const teacherId = await resolveAssignedTeacherId(this.context as AuthContext, this.input.teacherId);

    const session = await createAttendanceSession({
      organizationId: this.context.organizationId,
      academicYearId: this.input.academicYearId,
      academicTermId: this.input.academicTermId ?? null,
      classGroupId: this.input.classGroupId,
      courseId: this.input.courseId,
      courseLevelId: this.input.courseLevelId,
      subjectId: this.input.subjectId,
      levelSubjectId: this.input.levelSubjectId,
      teacherId,
      classroomId: this.input.classroomId ?? null,
      scheduleSlotId: this.input.scheduleSlotId ?? null,
      sessionDate: new Date(this.input.sessionDate),
      startTime: this.input.startTime,
      endTime: this.input.endTime,
      durationMinutes,
      title: this.input.title ?? null,
      notes: this.input.notes ?? null,
      status: "DRAFT",
      createdBy: this.context.userId,
    });

    await auditService.log(this.context, {
      entity: "AttendanceSession",
      entityId: session.id,
      action: "attendance_session.created",
      newValues: {
        classGroupId: session.classGroupId,
        subjectId: session.subjectId,
        sessionDate: session.sessionDate,
        status: session.status,
      },
    });

    return session;
  }
}
