import { NextResponse } from "next/server";
import { requireOrganization } from "@/server/auth/context";
import { certificateStudentReadService } from "@/modules/certificates/services/certificate-student-read.service";
import { mapCertificateError } from "@/modules/certificates/lib/portal-http";

// =============================================================================
// GET /api/student/certificates/:id — the student's OWN certificate detail.
// -----------------------------------------------------------------------------
// Redacted student DTO (no audit/events, no checksums, no transcript pointer, no
// finance reference). Another student's / unknown id → 404 (own-scope in service).
// =============================================================================

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  let context;
  try {
    context = await requireOrganization();
  } catch {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  try {
    const { id } = await params;
    const detail = await certificateStudentReadService.getDetail(context, id);
    if (!detail) {
      return NextResponse.json({ error: "Certificado não encontrado" }, { status: 404 });
    }
    return NextResponse.json(detail);
  } catch (err) {
    return mapCertificateError(err);
  }
}
