import { AuthorizationError, NotFoundError } from "@/shared/lib/command";
import type { AuthContext } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { findExamSessionById } from "@/modules/examinations/repositories/exam-session.repository";
import {
  listInvigilatorsForSession,
  listAssignableTeachers,
} from "@/modules/examinations/repositories/exam-admin-read.repository";
import type { ExamInvigilatorPanelDto } from "@/modules/examinations/types/portal";

// =============================================================================
// EXAM INVIGILATOR ADMIN READ SERVICE (Increment 4) — org-scoped, READ-ONLY
// -----------------------------------------------------------------------------
// The Vigilantes tab: current assignments for a session (names + role) plus the
// assignable-teacher picker source. `canAssign` is server-computed (exams.schedule);
// the UI renders it, never re-derives it. Assignments are APPEND-ONLY in v1 — there
// is no unassign (documented domain decision), so no remove capability is exposed.
// Requires `exams.view`. No writes.
// =============================================================================

export class ExamInvigilatorAdminReadService {
  private assertCanView(context: AuthContext): void {
    if (!context.ability.can(PERMISSIONS.EXAMS_VIEW)) throw new AuthorizationError();
  }

  async getPanel(context: AuthContext, examSessionId: string): Promise<ExamInvigilatorPanelDto> {
    this.assertCanView(context);
    const { organizationId } = context;

    const session = await findExamSessionById({ organizationId, id: examSessionId });
    if (!session) throw new NotFoundError("ExamSession", examSessionId);

    const canAssign = context.ability.can(PERMISSIONS.EXAMS_SCHEDULE);
    const [items, assignableTeachers] = await Promise.all([
      listInvigilatorsForSession(organizationId, examSessionId),
      // Only fetch the picker source when the viewer can actually assign.
      canAssign ? listAssignableTeachers(organizationId) : Promise.resolve([]),
    ]);

    return {
      examSessionId,
      items: items.map((i) => ({
        assignmentId: i.assignmentId,
        examSessionId,
        teacherId: i.teacherId,
        userId: i.userId,
        role: i.role,
        name: i.name,
      })),
      assignableTeachers,
      canAssign,
    };
  }
}

export const examInvigilatorAdminReadService = new ExamInvigilatorAdminReadService();
