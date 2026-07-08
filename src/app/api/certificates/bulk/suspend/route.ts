import { NextResponse } from "next/server";
import { requireOrganization } from "@/server/auth/context";
import { BulkSuspendCertificatesCommand } from "@/modules/certificates/commands/bulk-certificate.commands";
import { mapCertificateError } from "@/modules/certificates/lib/portal-http";

// POST /api/certificates/bulk/suspend (Phase 13) — admin; orchestrates SuspendCertificateCommand.
export async function POST(req: Request): Promise<NextResponse> {
  let context;
  try {
    context = await requireOrganization();
  } catch {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const result = await new BulkSuspendCertificatesCommand(body as never, context).run();
    return NextResponse.json(result);
  } catch (err) {
    return mapCertificateError(err);
  }
}
