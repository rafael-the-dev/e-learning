import { NextResponse } from "next/server";
import { requireOrganization } from "@/server/auth/context";
import { BulkRestoreCertificatesCommand } from "@/modules/certificates/commands/bulk-certificate.commands";
import { mapCertificateError } from "@/modules/certificates/lib/portal-http";

// POST /api/certificates/bulk/restore (Phase 13) — admin; orchestrates RestoreCertificateCommand.
export async function POST(req: Request): Promise<NextResponse> {
  let context;
  try {
    context = await requireOrganization();
  } catch {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const result = await new BulkRestoreCertificatesCommand(body as never, context).run();
    return NextResponse.json(result);
  } catch (err) {
    return mapCertificateError(err);
  }
}
