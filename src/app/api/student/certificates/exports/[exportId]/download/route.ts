import { NextResponse } from "next/server";
import { requireOrganization } from "@/server/auth/context";
import { AuthorizationError, BusinessRuleError, NotFoundError } from "@/shared/lib/command";
import { certificateExportDownloadService } from "@/modules/certificates/services/certificate-export-download.service";
import { buildCertificateDownloadResponse } from "@/modules/certificates/lib/portal-http";

// =============================================================================
// GET /api/student/certificates/exports/:exportId/download (Phase 10)
// -----------------------------------------------------------------------------
// A student-namespaced alias over the SAME Phase 8C download service, which already
// enforces STUDENT own-scope server-side (studentId from the session; another
// student's export → 403/404). Bytes are streamed THROUGH THE SERVER — the storage
// key / fileUrl are internal and never exposed. The response headers are built by the
// shared helper so this alias and the Phase 8C route cannot drift. Status mapping
// mirrors Phase 8C.
// =============================================================================

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ exportId: string }> }
): Promise<NextResponse> {
  let context;
  try {
    context = await requireOrganization();
  } catch {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  try {
    const { exportId } = await params;
    const result = await certificateExportDownloadService.download(context, exportId);
    return buildCertificateDownloadResponse(result);
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return NextResponse.json({ error: "Sem acesso a este recurso" }, { status: 403 });
    }
    if (err instanceof NotFoundError) {
      return NextResponse.json({ error: "Exportação não encontrada" }, { status: 404 });
    }
    if (err instanceof BusinessRuleError) {
      return NextResponse.json({ error: "A exportação ainda não está pronta" }, { status: 409 });
    }
    return NextResponse.json({ error: "Erro interno no servidor" }, { status: 500 });
  }
}
