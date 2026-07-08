import { NextResponse } from "next/server";
import { requireOrganization } from "@/server/auth/context";
import { BulkIssueCertificatesCommand } from "@/modules/certificates/commands/bulk-certificate.commands";
import { mapCertificateError } from "@/modules/certificates/lib/portal-http";

// POST /api/certificates/bulk/issue (Phase 13) — admin; orchestrates IssueCertificateCommand.
export async function POST(req: Request): Promise<NextResponse> {
  let context;
  try {
    context = await requireOrganization();
  } catch {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const result = await new BulkIssueCertificatesCommand(body as never, context).run();
    return NextResponse.json(result);
  } catch (err) {
    return mapCertificateError(err);
  }
}
