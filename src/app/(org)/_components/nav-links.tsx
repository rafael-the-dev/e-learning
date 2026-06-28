import { requireOrganization } from "@/server/auth/context";
import { isTeacherScopedRoles } from "@/server/auth/teacher-scope";
import { isStudentScopedRoles } from "@/server/auth/student-scope";
import { isGuardianScopedRoles } from "@/server/auth/guardian-scope";
import type { Permission } from "@/server/auth/permissions";
import { NAVIGATION_GROUPS } from "./nav-config";
import { NavLinksClient } from "./nav-links-client";

// The only routes a teacher-scoped user may reach are scoped surfaces; every
// other (org) page redirects them to /teacher (see teacher-scope.ts), so the
// sidebar mirrors that — showing only this minimal, scoped set. Keep in sync
// with the page-level guards in docs/teacher-access-scope.md.
const TEACHER_NAV_ALLOWLIST = new Set<string>([
  "/teacher",
  "/class-groups",
  "/students",
  "/attendance",
  "/assessments",
  "/grades",
  "/student-progress",
  "/notifications",
]);

// Teacher-only surfaces — shown ONLY to teacher-scoped users, never to anyone
// else. ORG_ADMIN/SUPER_ADMIN hold `teacherPortal.view` via their full-permission
// wildcard, so a `requiredPermission` gate alone can't hide the Teacher Portal
// from them; this set does. The Portal is a teacher's own daily workspace and
// has no meaning for an admin/secretary.
const TEACHER_ONLY_HREFS = new Set<string>(["/teacher"]);

// A student-scoped user only ever reaches their own Portal + their own
// notifications; every other (org) page redirects them to /student (see
// student-scope.ts). The sidebar mirrors that minimal set.
const STUDENT_NAV_ALLOWLIST = new Set<string>(["/student", "/notifications"]);

// Student-only surfaces — shown ONLY to student-scoped users. Like the Teacher
// Portal, ORG_ADMIN/SUPER_ADMIN hold `studentPortal.view` via their wildcard, so
// this set hides /student from everyone who isn't a student.
const STUDENT_ONLY_HREFS = new Set<string>(["/student"]);

// A guardian-scoped user only ever reaches their own Portal + their own
// notifications. The sidebar mirrors that minimal set — no student lists,
// finance dashboards, reports, settings, or other portals.
const GUARDIAN_NAV_ALLOWLIST = new Set<string>(["/guardian", "/notifications"]);

// Guardian-only surfaces — shown ONLY to guardian-scoped users. ORG_ADMIN/
// SUPER_ADMIN hold `guardianPortal.view` via their wildcard, so this set hides
// /guardian from everyone who isn't a guardian (admins may still navigate
// directly for preview/support).
const GUARDIAN_ONLY_HREFS = new Set<string>(["/guardian"]);

// Server component — fetches permissions server-side and passes
// only the allowed hrefs to the client renderer.
// requireOrganization() is React.cache()-wrapped so this adds zero
// extra DB queries when layout.tsx already resolved the session.
export async function NavLinks() {
  let allowedHrefs: string[];

  try {
    const ctx = await requireOrganization();
    const teacherScoped = isTeacherScopedRoles(ctx.roles);
    const studentScoped = isStudentScopedRoles(ctx.roles);
    const guardianScoped = isGuardianScopedRoles(ctx.roles);
    allowedHrefs = NAVIGATION_GROUPS.flatMap((g) => g.items)
      .filter((item) => !item.requiredPermission || ctx.ability.can(item.requiredPermission as Permission))
      .filter((item) => !teacherScoped || TEACHER_NAV_ALLOWLIST.has(item.href))
      .filter((item) => teacherScoped || !TEACHER_ONLY_HREFS.has(item.href))
      .filter((item) => !studentScoped || STUDENT_NAV_ALLOWLIST.has(item.href))
      .filter((item) => studentScoped || !STUDENT_ONLY_HREFS.has(item.href))
      .filter((item) => !guardianScoped || GUARDIAN_NAV_ALLOWLIST.has(item.href))
      .filter((item) => guardianScoped || !GUARDIAN_ONLY_HREFS.has(item.href))
      .map((item) => item.href);
  } catch {
    allowedHrefs = [];
  }

  const allowedSet = new Set(allowedHrefs);

  const visibleGroups = NAVIGATION_GROUPS
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => allowedSet.has(item.href)),
    }))
    .filter((group) => group.items.length > 0);

  return <NavLinksClient groups={visibleGroups} />;
}
