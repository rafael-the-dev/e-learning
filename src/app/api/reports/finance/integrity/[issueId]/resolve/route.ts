import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { ResolveFinancialIntegrityIssueCommand } from "@/modules/finance/integrity/commands/resolve-financial-integrity-issue.command";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ issueId: string }> }
) {
  try {
    const context = await requirePermission(PERMISSIONS.INTEGRITY_ISSUES_RESOLVE);
    const body = await req.json();
    const { issueId } = await params;

    const command = new ResolveFinancialIntegrityIssueCommand(
      {
        issueId,
        newStatus: body.newStatus,
        resolutionNotes: body.resolutionNotes,
      },
      context
    );

    const result = await command.run();
    return NextResponse.json(result);
  } catch (err: unknown) {
    const error = err as { name?: string; message?: string; fieldErrors?: Record<string, string[]> };
    if (error.name === "ValidationError" || error.name === "BusinessRuleError") {
      return NextResponse.json(
        { error: error.message, fieldErrors: error.fieldErrors },
        { status: 422 }
      );
    }
    if (error.name === "AuthorizationError") {
      return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
    }
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
