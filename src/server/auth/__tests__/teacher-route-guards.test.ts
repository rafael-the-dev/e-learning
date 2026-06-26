import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { PERMISSIONS, ROLE_PERMISSIONS } from "@/server/auth/permissions";

// =============================================================================
// ROUTE-GUARD REGRESSION TEST
//
// Goal: a future (org) page cannot silently become TEACHER-visible while showing
// or mutating another teacher's existing records. Every page whose ENTRY
// permission guard is one a TEACHER holds AND that exposes existing student /
// class / attendance / assessment / grade data must declare its teacher
// behaviour with one of the guard tokens below — a scoped early-return
// (resolveDataAccessScope), a redirect (redirectIfTeacherScoped /
// resolveTeacherScope), or a per-record ownership assertion
// (assertTeacherCanAccess*). See docs/teacher-access-scope.md.
//
// Create-only pages (…/new), curriculum reference (courses/subjects/lessons),
// and admin-only perms are intentionally out of this set.
// =============================================================================

const ORG_DIR = join(process.cwd(), "src", "app", "(org)");

const GUARD_TOKENS = [
  "resolveDataAccessScope",
  "redirectIfTeacherScoped",
  "resolveTeacherScope",
  "assertTeacherCanAccessStudent",
  "assertTeacherCanAccessClassGroup",
  "assertTeacherCanAccessAttendanceSession",
  "assertTeacherCanAccessAssessment",
  "assertTeacherCanAccessEnrollment",
];

// Permission KEYS (from PERMISSIONS) whose pages expose/mutate existing,
// potentially cross-teacher records. A page guarded by one of these (as its
// entry permission) must carry a guard token.
const SENSITIVE_KEYS = [
  "STUDENTS_READ",
  "STUDENT_TIMELINE_VIEW",
  "STUDENT_COURSE_PROGRESS_VIEW",
  "STUDENT_SUBJECT_PROGRESS_VIEW",
  "CLASS_GROUPS_READ",
  "ENROLLMENTS_VIEW",
  "ATTENDANCE_SESSIONS_VIEW",
  "ATTENDANCE_RECORDS_VIEW",
  "ATTENDANCE_RECORDS_MARK",
  "ATTENDANCE_JUSTIFICATIONS_VIEW",
  "ASSESSMENTS_VIEW",
  "ASSESSMENT_RESULTS_VIEW",
  "ASSESSMENT_RESULTS_GRADE",
  "GRADES_VIEW",
  "GRADES_CREATE",
  "LEVEL_PROGRESSION_VIEW",
] as const;

const TEACHER_PERMS = new Set(ROLE_PERMISSIONS.TEACHER as string[]);

function walkPages(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walkPages(full, acc);
    } else if (entry === "page.tsx") {
      acc.push(full);
    }
  }
  return acc;
}

/** Route path (e.g. "/attendance/sessions/[sessionId]") from an absolute file path. */
function routeOf(file: string): string {
  const rel = file.slice(ORG_DIR.length).replace(/\\/g, "/").replace(/\/page\.tsx$/, "");
  return rel === "" ? "/" : rel;
}

/** Permission KEYS passed to the requirePermission family — the entry guards. */
function entryPermissionKeys(source: string): string[] {
  const keys: string[] = [];
  const re = /require(?:Permission|PermissionOrRedirect)\(\s*PERMISSIONS\.([A-Z0-9_]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) keys.push(m[1]!);
  return keys;
}

const PAGE_FILES = walkPages(ORG_DIR);

describe("teacher route-guard coverage (sensitive pages)", () => {
  it("found the (org) pages", () => {
    expect(PAGE_FILES.length).toBeGreaterThan(50);
  });

  for (const file of PAGE_FILES) {
    const route = routeOf(file);
    const source = readFileSync(file, "utf8");
    const keys = entryPermissionKeys(source);

    // Pages gated by a role TEACHER lacks aren't reachable by teachers.
    const roleGated = /require(?:Role|RoleOrRedirect)\(/.test(source);

    const sensitiveTeacherKeys = keys.filter(
      (k) =>
        (SENSITIVE_KEYS as readonly string[]).includes(k) &&
        TEACHER_PERMS.has((PERMISSIONS as Record<string, string>)[k] ?? "__none__")
    );

    if (roleGated || sensitiveTeacherKeys.length === 0) continue;

    it(`${route} declares teacher-scope behaviour`, () => {
      const hasGuard = GUARD_TOKENS.some((t) => source.includes(t));
      expect(
        hasGuard,
        `Page "${route}" is reachable by a TEACHER via permission(s) [${sensitiveTeacherKeys.join(
          ", "
        )}] and exposes existing records, but declares no teacher-scope guard. Add a scoped early-return, redirectIfTeacherScoped, or an assertTeacherCanAccess* ownership guard. See docs/teacher-access-scope.md.`
      ).toBe(true);
    });
  }
});

// Explicit manifest — pins each fixed route to the specific guard it must keep,
// so removing a guard from a known page fails loudly (not just "some token").
describe("teacher route-guard manifest (pinned)", () => {
  const MANIFEST: Array<{ file: string; token: string }> = [
    // Scoped list pages — early-return scoped view
    { file: "students/page.tsx", token: "resolveDataAccessScope" },
    { file: "class-groups/page.tsx", token: "resolveDataAccessScope" },
    { file: "attendance/sessions/page.tsx", token: "resolveDataAccessScope" },
    { file: "assessments/page.tsx", token: "resolveDataAccessScope" },
    // Scoped detail pages — per-record ownership
    { file: "students/[studentId]/page.tsx", token: "assertTeacherCanAccessStudent" },
    { file: "students/[studentId]/timeline/page.tsx", token: "assertTeacherCanAccessStudent" },
    { file: "class-groups/[classGroupId]/page.tsx", token: "assertTeacherCanAccessClassGroup" },
    { file: "enrollments/[enrollmentId]/page.tsx", token: "assertTeacherCanAccessEnrollment" },
    { file: "attendance/sessions/[sessionId]/page.tsx", token: "assertTeacherCanAccessAttendanceSession" },
    { file: "attendance/sessions/[sessionId]/mark/page.tsx", token: "assertTeacherCanAccessAttendanceSession" },
    { file: "assessments/[assessmentId]/page.tsx", token: "assertTeacherCanAccessAssessment" },
    { file: "assessments/[assessmentId]/grade/page.tsx", token: "assertTeacherCanAccessAssessment" },
    // Blocked org-wide pages — redirect to /teacher
    { file: "enrollments/page.tsx", token: "redirectIfTeacherScoped" },
    { file: "grades/page.tsx", token: "redirectIfTeacherScoped" },
    { file: "grades/entry/page.tsx", token: "redirectIfTeacherScoped" },
    { file: "student-progress/page.tsx", token: "redirectIfTeacherScoped" },
    { file: "schedules/page.tsx", token: "redirectIfTeacherScoped" },
    { file: "level-progression/page.tsx", token: "redirectIfTeacherScoped" },
    { file: "courses/page.tsx", token: "redirectIfTeacherScoped" },
    { file: "subjects/page.tsx", token: "redirectIfTeacherScoped" },
    { file: "lessons/page.tsx", token: "redirectIfTeacherScoped" },
    { file: "classroom-bookings/page.tsx", token: "redirectIfTeacherScoped" },
    { file: "academic-calendar/page.tsx", token: "redirectIfTeacherScoped" },
    { file: "classrooms/page.tsx", token: "redirectIfTeacherScoped" },
    { file: "assessment-policies/page.tsx", token: "redirectIfTeacherScoped" },
    { file: "assessment-periods/page.tsx", token: "redirectIfTeacherScoped" },
    { file: "attendance/reports/page.tsx", token: "redirectIfTeacherScoped" },
    { file: "attendance/justifications/page.tsx", token: "redirectIfTeacherScoped" },
    // Attendance hub redirects teacher-scoped users straight to their scoped list
    { file: "attendance/page.tsx", token: "resolveTeacherScope" },
  ];

  for (const { file, token } of MANIFEST) {
    it(`${file} contains ${token}`, () => {
      const source = readFileSync(join(ORG_DIR, ...file.split("/")), "utf8");
      expect(source.includes(token), `${file} must contain "${token}"`).toBe(true);
    });
  }
});

describe("teacher sidebar allowlist", () => {
  it("exposes only the scoped surfaces", () => {
    const navSource = readFileSync(
      join(process.cwd(), "src", "app", "(org)", "_components", "nav-links.tsx"),
      "utf8"
    );
    const block = navSource.match(/TEACHER_NAV_ALLOWLIST\s*=\s*new Set<string>\(\[([\s\S]*?)\]\)/);
    expect(block, "TEACHER_NAV_ALLOWLIST not found").toBeTruthy();
    const hrefs = Array.from(block![1]!.matchAll(/"([^"]+)"/g)).map((m) => m[1]!).sort();
    expect(hrefs).toEqual(
      ["/assessments", "/attendance", "/class-groups", "/notifications", "/students", "/teacher"].sort()
    );
  });
});
