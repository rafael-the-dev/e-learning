import { NextResponse } from "next/server";
import { requireOrganization } from "@/server/auth/context";
import { ExportCertificateCommand } from "@/modules/certificates/commands/export-certificate.command";
import { mapCertificateError } from "@/modules/certificates/lib/portal-http";

// POST /api/certificates/:id/export (Phase 10) — thin shell over ExportCertificateCommand
// (authorize: certificates.export). Renders + tracks a PDF artifact; the route never
// renders a PDF itself and never exposes a fileUrl/storage key. Download is a separate
// authenticated endpoint (Phase 8C).
export async function POST(
  req: Request,
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
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const result = await new ExportCertificateCommand(
      { certificateId: id, exportType: body.exportType as string | undefined },
      context
    ).run();
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return mapCertificateError(err);
  }
}
