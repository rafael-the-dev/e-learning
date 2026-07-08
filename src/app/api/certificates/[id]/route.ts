import { NextResponse } from "next/server";
import { requireOrganization } from "@/server/auth/context";
import { certificateAdminReadService } from "@/modules/certificates/services/certificate-admin-read.service";
import { mapCertificateError } from "@/modules/certificates/lib/portal-http";

// =============================================================================
// GET /api/certificates/:id — admin/secretary certificate detail (Phase 10)
// -----------------------------------------------------------------------------
// Org-scoped detail DTO with the safe event/export history + allowedActions.
// Cross-tenant / unknown id → 404 (no existence leak). Read-only.
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
    const detail = await certificateAdminReadService.getDetail(context, id);
    if (!detail) {
      return NextResponse.json({ error: "Certificado não encontrado" }, { status: 404 });
    }
    return NextResponse.json(detail);
  } catch (err) {
    return mapCertificateError(err);
  }
}
