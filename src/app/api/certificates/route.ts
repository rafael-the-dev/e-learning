import { NextResponse } from "next/server";
import { requireOrganization } from "@/server/auth/context";
import { certificateAdminReadService } from "@/modules/certificates/services/certificate-admin-read.service";
import { mapCertificateError, parseAdminListFilters } from "@/modules/certificates/lib/portal-http";

// =============================================================================
// GET /api/certificates — admin/secretary certificate list (Phase 10)
// -----------------------------------------------------------------------------
// Org-scoped, paginated list with server-computed allowedActions. Authorization
// (`certificates.view`) + tenant scoping live in the read service; the route is a
// transport shell. No Academic Core / Transcript read, no eligibility recompute.
// =============================================================================

export async function GET(req: Request): Promise<NextResponse> {
  let context;
  try {
    context = await requireOrganization();
  } catch {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  try {
    const filters = parseAdminListFilters(new URL(req.url).searchParams);
    const result = await certificateAdminReadService.list(context, filters);
    return NextResponse.json(result);
  } catch (err) {
    return mapCertificateError(err);
  }
}
