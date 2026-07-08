import { NextResponse } from "next/server";
import { requireOrganization } from "@/server/auth/context";
import { BulkGenerateCertificatesCommand } from "@/modules/certificates/commands/bulk-certificate.commands";
import { mapCertificateError } from "@/modules/certificates/lib/portal-http";

// POST /api/certificates/bulk/generate (Phase 13) — admin. Thin shell: validate +
// authorize (certificates.generate) happen in the bulk command, which orchestrates
// GenerateCertificateCommand per item. Returns a BulkOperationResult (200) even with
// partial failures; only invalid input (422) / unauthorized (401/403) throw.
export async function POST(req: Request): Promise<NextResponse> {
  let context;
  try {
    context = await requireOrganization();
  } catch {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const result = await new BulkGenerateCertificatesCommand(body as never, context).run();
    return NextResponse.json(result);
  } catch (err) {
    return mapCertificateError(err);
  }
}
