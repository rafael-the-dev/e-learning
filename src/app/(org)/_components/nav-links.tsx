import { requireOrganization } from "@/server/auth/context";
import { isTeacherScopedRoles } from "@/server/auth/teacher-scope";
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

// Server component — fetches permissions server-side and passes
// only the allowed hrefs to the client renderer.
// requireOrganization() is React.cache()-wrapped so this adds zero
// extra DB queries when layout.tsx already resolved the session.
export async function NavLinks() {
  let allowedHrefs: string[];

  try {
    const ctx = await requireOrganization();
    const teacherScoped = isTeacherScopedRoles(ctx.roles);
    allowedHrefs = NAVIGATION_GROUPS.flatMap((g) => g.items)
      .filter((item) => !item.requiredPermission || ctx.ability.can(item.requiredPermission as Permission))
      .filter((item) => !teacherScoped || TEACHER_NAV_ALLOWLIST.has(item.href))
      .filter((item) => teacherScoped || !TEACHER_ONLY_HREFS.has(item.href))
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
