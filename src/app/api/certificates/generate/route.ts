import { NextResponse } from "next/server";
import { requireOrganization } from "@/server/auth/context";
import { GenerateCertificateCommand } from "@/modules/certificates/commands/generate-certificate.command";
import { mapCertificateError } from "@/modules/certificates/lib/portal-http";

// =============================================================================
// POST /api/certificates/generate (Phase 10) — thin shell over the command.
// -----------------------------------------------------------------------------
// Delegates entirely to GenerateCertificateCommand (validate → authorize
// [certificates.generate] → execute). The route implements NO business rule and
// duplicates NO eligibility — the command is the sole authority.
// =============================================================================

export async function POST(req: Request): Promise<NextResponse> {
  let context;
  try {
    context = await requireOrganization();
  } catch {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const result = await new GenerateCertificateCommand(
      {
        transcriptVersionId: body.transcriptVersionId as string,
        certificateType: body.certificateType as string,
        policyId: body.policyId as string | undefined,
        courseId: body.courseId as string | undefined,
        reason: body.reason as string | undefined,
      },
      context
    ).run();
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return mapCertificateError(err);
  }
}
