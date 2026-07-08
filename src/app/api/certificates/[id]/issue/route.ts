import { NextResponse } from "next/server";
import { requireOrganization } from "@/server/auth/context";
import { IssueCertificateCommand } from "@/modules/certificates/commands/issue-certificate.command";
import { mapCertificateError } from "@/modules/certificates/lib/portal-http";

// POST /api/certificates/:id/issue (Phase 10) — thin shell over IssueCertificateCommand
// (authorize: certificates.issue). No business rule in the route.
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
    const result = await new IssueCertificateCommand(
      { certificateId: id, reason: body.reason as string | undefined },
      context
    ).run();
    return NextResponse.json(result);
  } catch (err) {
    return mapCertificateError(err);
  }
}
