import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { AuthorizationError } from "@/shared/lib/command";
import { isStudentScopedRoles } from "@/server/auth/student-scope";
import { isGuardianScopedRoles } from "@/server/auth/guardian-scope";
import { assertTeacherCanAccessClassGroup } from "@/server/auth/teacher-access";
import { getClassGroupSubjectAttendanceReport } from "@/modules/attendance/services/attendance-read-model.service";

// =============================================================================
// GET /api/attendance/reports?classGroupId=…
//
// Source of truth (Fix C1): reads exclusively from the persisted
// StudentSubjectAttendanceSummary via the read-model service — it never
// recomputes attendance from raw records (the retired legacy calculator did).
//
// Row-level authorization (Fix H1): the endpoint returns a CLASS ROSTER (every
// enrolled student × subject), so the `attendanceSessions.view` permission +
// `organizationId` scoping is NOT sufficient — that only enforces tenant
// isolation, not horizontal authorization *inside* the tenant. The UI redirects
// teacher/student-scoped users away, but the API is directly reachable, so the
// scope MUST be resolved and enforced here, server-side. The incoming
// `classGroupId` is untrusted.
//
//   • STUDENT / GUARDIAN — must never receive a class roster (it exposes other
//     students). They read their own attendance through the /student and
//     /guardian portals, which are scoped independently. Denied outright.
//     (GUARDIAN also lacks `attendanceSessions.view`, so `requirePermission`
//     already blocks it; this is defence-in-depth if that ever changes.)
//   • TEACHER — only class groups they teach. `assertTeacherCanAccessClassGroup`
//     throws for any other class group and is a no-op for admins/secretaries.
//   • ORG_ADMIN / SECRETARY / SUPER_ADMIN — unrestricted within the tenant.
//
// Authorization runs BEFORE the read, so a denied caller never triggers a query
// (no read-then-filter). `organizationId` is always taken from the authenticated
// context, never from the request.
// =============================================================================
export async function GET(req: NextRequest) {
  try {
    const context = await requirePermission(PERMISSIONS.ATTENDANCE_SESSIONS_VIEW);
    const { searchParams } = req.nextUrl;
    const classGroupId = searchParams.get("classGroupId");

    if (!classGroupId) {
      return NextResponse.json({ error: "classGroupId obrigatório" }, { status: 400 });
    }

    // Student-/guardian-scoped callers may never read a class roster.
    if (isStudentScopedRoles(context.roles) || isGuardianScopedRoles(context.roles)) {
      throw new AuthorizationError("Não tem acesso a este relatório de presenças.");
    }

    // Teacher-scoped callers may only read a class group they teach (no-op for
    // admins/secretaries). Throws AuthorizationError otherwise — before the read.
    await assertTeacherCanAccessClassGroup(context, classGroupId);

    const report = await getClassGroupSubjectAttendanceReport(
      classGroupId,
      context.organizationId
    );

    return NextResponse.json(report);
  } catch (err) {
    // Authenticated but not permitted / out of scope → 403. Anything else
    // (unauthenticated, session resolution failure) → 401. Never leak details.
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: "Sem acesso a este recurso" }, { status: 403 });
    }
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
}
