import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { findImportJobById } from "@/modules/import-jobs/repositories/import-job.repository";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  let context;
  try {
    context = await requirePermission(PERMISSIONS.STUDENTS_IMPORT);
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { jobId } = await params;
  const job = await findImportJobById(jobId, context.organizationId);
  if (!job) {
    return NextResponse.json({ error: "Pedido de importação não encontrado" }, { status: 404 });
  }

  return NextResponse.json(job);
}
