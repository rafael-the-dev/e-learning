import { PERMISSIONS } from "@/server/auth/permissions";
import type { Permission } from "@/server/auth/permissions";
import type { Teacher360TabKey } from "@/modules/teachers/teacher-360/types";

export interface Teacher360TabAccess {
  key: Teacher360TabKey;
  visible: boolean;
}

/**
 * Pure RBAC gate for Teacher 360 tabs — takes a permission-check predicate so
 * it can be unit-tested without constructing a real Ability/AuthContext.
 */
export function getTeacher360TabAccess(can: (permission: Permission) => boolean): Teacher360TabAccess[] {
  return [
    { key: "overview", visible: true },
    { key: "schedule", visible: can(PERMISSIONS.TEACHERS_VIEW_SCHEDULE) },
    { key: "classGroups", visible: can(PERMISSIONS.CLASS_GROUPS_READ) },
    { key: "subjects", visible: can(PERMISSIONS.SUBJECTS_VIEW) },
    { key: "assessments", visible: can(PERMISSIONS.ASSESSMENTS_VIEW) },
    { key: "attendance", visible: can(PERMISSIONS.ATTENDANCE_SESSIONS_VIEW) },
    { key: "performance", visible: can(PERMISSIONS.TEACHERS_VIEW_PERFORMANCE) },
    { key: "timeline", visible: true },
    { key: "documents", visible: can(PERMISSIONS.TEACHER_DOCUMENTS_VIEW) },
  ];
}

export function resolveActiveTeacher360Tab(
  requested: string | undefined,
  access: Teacher360TabAccess[]
): Teacher360TabKey {
  const visibleKeys = access.filter((a) => a.visible).map((a) => a.key);
  if (requested && (visibleKeys as string[]).includes(requested)) {
    return requested as Teacher360TabKey;
  }
  return "overview";
}

/**
 * Route-level gate: an unscoped TEACHERS_VIEW_360 grants access to any teacher's
 * 360 page; TEACHERS_VIEW_OWN_360 only grants access when the caller's userId
 * matches the teacher's linked userId (Teacher.userId). Pure — takes the owner
 * check as a boolean so it's unit-testable without a real Ability.
 */
export function canViewTeacher360(can: (permission: Permission) => boolean, isOwner: boolean): boolean {
  if (can(PERMISSIONS.TEACHERS_VIEW_360)) return true;
  return isOwner && can(PERMISSIONS.TEACHERS_VIEW_OWN_360);
}
