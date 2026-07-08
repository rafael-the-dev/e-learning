import { NextResponse } from "next/server";
import { requireOrganization } from "@/server/auth/context";
import { certificateStudentReadService } from "@/modules/certificates/services/certificate-student-read.service";
import { mapCertificateError } from "@/modules/certificates/lib/portal-http";

// =============================================================================
// GET /api/student/certificates — the authenticated student's OWN certificates.
// -----------------------------------------------------------------------------
// Own-scope (studentId resolved server-side) + `certificates.viewOwn` are enforced
// by the student read service; the route is a transport shell. Redacted DTOs only.
// =============================================================================

export async function GET(req: Request): Promise<NextResponse> {
  let context;
  try {
    context = await requireOrganization();
  } catch {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  try {
    const sp = new URL(req.url).searchParams;
    const parsePage = (v: string | null) => {
      if (v === null) return undefined;
      const n = Number.parseInt(v, 10);
      return Number.isFinite(n) ? n : undefined;
    };
    const result = await certificateStudentReadService.list(context, {
      certificateType: sp.get("certificateType") ?? undefined,
      status: sp.get("status") ?? undefined,
      page: parsePage(sp.get("page")),
      pageSize: parsePage(sp.get("pageSize")),
    });
    return NextResponse.json(result);
  } catch (err) {
    return mapCertificateError(err);
  }
}
