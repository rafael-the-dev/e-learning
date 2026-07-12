import { AuthorizationError } from "@/shared/lib/command";
import type { AuthContext } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import {
  lookupStudents,
  lookupEnrollmentsForStudent,
  lookupRooms,
  lookupLevelSubjects,
  lookupPeriods,
  type StudentLookupRow,
  type EnrollmentLookupRow,
  type RoomLookupRow,
  type LevelSubjectLookupRow,
  type PeriodLookupRow,
} from "@/modules/examinations/repositories/exam-admin-read.repository";

// =============================================================================
// EXAM LOOKUP ADMIN READ SERVICE (Increment 4) — picker data, READ-ONLY
// -----------------------------------------------------------------------------
// Powers EntityLookupCombobox: capped, tenant-scoped name-first searches. Requires
// exams.view (the actual mutation stays gated by its command). No writes.
// =============================================================================

export class ExamLookupAdminReadService {
  private assertCanView(context: AuthContext): void {
    if (!context.ability.can(PERMISSIONS.EXAMS_VIEW)) throw new AuthorizationError();
  }

  async students(context: AuthContext, query: string): Promise<StudentLookupRow[]> {
    this.assertCanView(context);
    return lookupStudents(context.organizationId, query);
  }

  async enrollmentsForStudent(context: AuthContext, studentId: string): Promise<EnrollmentLookupRow[]> {
    this.assertCanView(context);
    if (!studentId) return [];
    return lookupEnrollmentsForStudent(context.organizationId, studentId);
  }

  async rooms(context: AuthContext, query: string): Promise<RoomLookupRow[]> {
    this.assertCanView(context);
    return lookupRooms(context.organizationId, query);
  }

  async levelSubjects(context: AuthContext, query: string): Promise<LevelSubjectLookupRow[]> {
    this.assertCanView(context);
    return lookupLevelSubjects(context.organizationId, query);
  }

  async periods(context: AuthContext, query: string): Promise<PeriodLookupRow[]> {
    this.assertCanView(context);
    return lookupPeriods(context.organizationId, query);
  }
}

export const examLookupAdminReadService = new ExamLookupAdminReadService();
