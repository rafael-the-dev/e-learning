import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { ValidateTeachersImportCommand } from "@/modules/teachers/import/commands/validate-teachers-import.command";

export async function POST(req: NextRequest) {
  let context;
  try {
    context = await requirePermission(PERMISSIONS.TEACHERS_IMPORT);
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Ficheiro não enviado" }, { status: 422 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const command = new ValidateTeachersImportCommand(
      { fileName: file.name, fileSize: file.size, buffer },
      context
    );
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
    console.error("[teachers-import-validate]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
