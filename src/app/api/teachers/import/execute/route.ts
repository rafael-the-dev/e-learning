import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { ExecuteTeachersImportCommand } from "@/modules/teachers/import/commands/execute-teachers-import.command";
import { executeImportSchema } from "@/modules/teachers/import/schemas/import.schema";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  let context;
  try {
    context = await requirePermission(PERMISSIONS.TEACHERS_IMPORT);
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const parsed = executeImportSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos" }, { status: 422 });
    }

    const command = new ExecuteTeachersImportCommand(parsed.data, context);
    const result = await command.run();
    return NextResponse.json(result);
  } catch (err: unknown) {
    const error = err as { name?: string; message?: string; fieldErrors?: Record<string, string[]> };
    if (error.name === "ValidationError" || error.name === "BusinessRuleError") {
      return NextResponse.json({ error: error.message, fieldErrors: error.fieldErrors }, { status: 422 });
    }
    if (error.name === "AuthorizationError") {
      return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
    }
    if (error.name === "NotFoundError") {
      return NextResponse.json({ error: "Pedido de importação não encontrado" }, { status: 404 });
    }
    console.error("[teachers-import-execute]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
