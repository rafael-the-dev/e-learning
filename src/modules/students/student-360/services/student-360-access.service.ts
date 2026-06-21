import { PERMISSIONS } from "@/server/auth/permissions";
import type { Permission } from "@/server/auth/permissions";
import type { Student360TabKey } from "@/modules/students/student-360/types";

export interface Student360TabAccess {
  key: Student360TabKey;
  visible: boolean;
}

/**
 * Pure RBAC gate for Student 360 tabs — takes a permission-check predicate so
 * it can be unit-tested without constructing a real Ability/AuthContext.
 */
export function getStudent360TabAccess(can: (permission: Permission) => boolean): Student360TabAccess[] {
  return [
    { key: "overview", visible: true },
    { key: "enrollments", visible: can(PERMISSIONS.ENROLLMENTS_VIEW) },
    { key: "finance", visible: can(PERMISSIONS.INVOICES_VIEW) },
    { key: "attendance", visible: can(PERMISSIONS.ATTENDANCE_SESSIONS_VIEW) },
    { key: "grades", visible: can(PERMISSIONS.GRADES_VIEW) },
    {
      key: "progress",
      visible: can(PERMISSIONS.STUDENT_LEVEL_PROGRESS_VIEW) || can(PERMISSIONS.STUDENT_COURSE_PROGRESS_VIEW),
    },
    { key: "documents", visible: can(PERMISSIONS.STUDENT_DOCUMENTS_VIEW) },
    { key: "timeline", visible: can(PERMISSIONS.STUDENT_TIMELINE_VIEW) },
  ];
}

export function resolveActiveStudent360Tab(
  requested: string | undefined,
  access: Student360TabAccess[]
): Student360TabKey {
  const visibleKeys = access.filter((a) => a.visible).map((a) => a.key);
  if (requested && (visibleKeys as string[]).includes(requested)) {
    return requested as Student360TabKey;
  }
  return "overview";
}
