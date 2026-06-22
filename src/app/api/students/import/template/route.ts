import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { buildCsvTemplate, buildXlsxTemplate } from "@/modules/students/import/services/file-parser.service";

export async function GET(req: NextRequest) {
  try {
    await requirePermission(PERMISSIONS.STUDENTS_IMPORT);
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const format = req.nextUrl.searchParams.get("format") === "xlsx" ? "xlsx" : "csv";

  if (format === "xlsx") {
    const buffer = buildXlsxTemplate();
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="modelo-importacao-alunos.xlsx"',
      },
    });
  }

  const csv = buildCsvTemplate();
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="modelo-importacao-alunos.csv"',
    },
  });
}
