import { NextResponse } from "next/server";
import { requireOrganization } from "@/server/auth/context";
import { SuspendCertificateCommand } from "@/modules/certificates/commands/suspend-certificate.command";
import { mapCertificateError } from "@/modules/certificates/lib/portal-http";

// POST /api/certificates/:id/suspend (Phase 10) — thin shell over SuspendCertificateCommand
// (authorize: certificates.suspend; reason required). No business rule in the route.
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
    const result = await new SuspendCertificateCommand(
      { certificateId: id, reason: (body.reason as string) ?? "" },
      context
    ).run();
    return NextResponse.json(result);
  } catch (err) {
    return mapCertificateError(err);
  }
}
