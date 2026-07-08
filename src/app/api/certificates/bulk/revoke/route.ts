import { NextResponse } from "next/server";
import { requireOrganization } from "@/server/auth/context";
import { BulkRevokeCertificatesCommand } from "@/modules/certificates/commands/bulk-certificate.commands";
import { mapCertificateError } from "@/modules/certificates/lib/portal-http";

// POST /api/certificates/bulk/revoke (Phase 13) — admin; orchestrates RevokeCertificateCommand.
export async function POST(req: Request): Promise<NextResponse> {
  let context;
  try {
    context = await requireOrganization();
  } catch {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const result = await new BulkRevokeCertificatesCommand(body as never, context).run();
    return NextResponse.json(result);
  } catch (err) {
    return mapCertificateError(err);
  }
}
