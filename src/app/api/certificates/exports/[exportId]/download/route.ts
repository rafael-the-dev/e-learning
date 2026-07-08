import { NextResponse } from "next/server";
import { requireOrganization } from "@/server/auth/context";
import { AuthorizationError, BusinessRuleError, NotFoundError } from "@/shared/lib/command";
import { certificateExportDownloadService } from "@/modules/certificates/services/certificate-export-download.service";

// =============================================================================
// GET /api/certificates/exports/:exportId/download
//
// Authenticated download of a READY certificate export (Phase 8C). The artifact is
// STREAMED THROUGH THE SERVER after authorization — the stored `fileUrl` / storage
// key is internal and never redirected to. `organizationId` and `studentId` come
// ONLY from the authenticated context (never from input); a cross-tenant export is
// indistinguishable from a missing one (404).
//
// Access (enforced in the service):
//   • ORG_ADMIN / SUPER_ADMIN / SECRETARY (certificates.view|export) — any export in
//     their tenant.
//   • STUDENT (certificates.viewOwn) — only their OWN certificate's export.
//   • TEACHER / GUARDIAN — denied (guardian certificate visibility is deferred).
//
// Status mapping: 401 unauthenticated · 403 authenticated-but-not-permitted · 404
// not found / cross-tenant / not accessible (incl. non-READY for non-owners) · 409
// the owner's export exists but is not READY · 500 storage/unexpected (generic, no
// path leakage). A revoked/suspended certificate STILL downloads — public
// verification reflects REVOKED/SUSPENDED separately (documented decision).
// =============================================================================

/** Sanitize a certificate number into a header-safe filename stem. */
function safeFilename(certificateNumber: string): string {
  const cleaned = certificateNumber.replace(/[^A-Za-z0-9._-]/g, "_");
  return cleaned.length > 0 ? cleaned : "certificate";
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ exportId: string }> }
): Promise<NextResponse> {
  // Establish an authenticated org context first — any failure here is a 401.
  let context;
  try {
    context = await requireOrganization();
  } catch {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  try {
    const { exportId } = await params;
    const result = await certificateExportDownloadService.download(context, exportId);

    const headers: Record<string, string> = {
      "Content-Type": result.contentType,
      "Content-Disposition": `attachment; filename="${safeFilename(result.certificateNumber)}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    };
    if (result.fileChecksum) headers.ETag = `"${result.fileChecksum}"`;

    // Stream the bytes through the server (never expose the storage key / fileUrl).
    return new NextResponse(new Uint8Array(result.buffer), { status: 200, headers });
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
    // Storage read failure / unexpected — generic, no internal detail or path leak.
    return NextResponse.json({ error: "Erro interno no servidor" }, { status: 500 });
  }
}
