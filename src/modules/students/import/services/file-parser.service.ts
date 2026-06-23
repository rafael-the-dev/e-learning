import Papa from "papaparse";
import * as XLSX from "xlsx";
import { ValidationError } from "@/shared/lib/command";
import type { StudentImportRow } from "@/modules/students/import/types";

// =============================================================================
// FILE PARSER SERVICE
// Reads raw CSV/XLSX bytes into StudentImportRow[]. Every cell is normalized
// to a trimmed string (never undefined) so downstream validation never has
// to special-case missing vs. empty values.
// =============================================================================

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
export const MAX_ROWS = 5000;

const TEMPLATE_COLUMNS = [
  "firstName",
  "lastName",
  "gender",
  "birthDate",
  "phone",
  "email",
  "documentType",
  "documentNumber",
  "address",
] as const;

function normalizeRow(raw: Record<string, unknown>): StudentImportRow {
  const cell = (key: string): string => {
    const value = raw[key];
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return value === null || value === undefined ? "" : String(value).trim();
  };
  return {
    firstName: cell("firstName"),
    lastName: cell("lastName"),
    gender: cell("gender"),
    birthDate: cell("birthDate"),
    phone: cell("phone"),
    email: cell("email"),
    documentType: cell("documentType"),
    documentNumber: cell("documentNumber"),
    address: cell("address"),
  };
}

export function assertFileConstraints(file: { size: number; name: string }): void {
  const extension = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
  if (extension !== ".csv" && extension !== ".xlsx") {
    throw new ValidationError("Dados inválidos", {
      file: ["Formato de ficheiro não suportado. Utilize .csv ou .xlsx"],
    });
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new ValidationError("Dados inválidos", {
      file: ["O ficheiro excede o limite de 10 MB"],
    });
  }
}

export function parseCsv(buffer: Buffer): StudentImportRow[] {
  const text = buffer.toString("utf-8");
  const result = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim(),
  });
  if (result.errors.length > 0) {
    throw new ValidationError("Dados inválidos", {
      file: ["Não foi possível ler o ficheiro CSV. Verifique o formato e tente novamente"],
    });
  }
  return result.data.map(normalizeRow);
}

export function parseXlsx(buffer: Buffer): StudentImportRow[] {
  let workbook: XLSX.WorkBook;
  try {
    // cellDates: true — without it, a genuinely date-formatted Excel cell
    // (as opposed to a text cell that merely looks like a date) round-trips
    // as a raw serial number, which fails parseImportDate downstream.
    workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  } catch {
    throw new ValidationError("Dados inválidos", {
      file: ["Não foi possível ler o ficheiro XLSX. Verifique o formato e tente novamente"],
    });
  }
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new ValidationError("Dados inválidos", { file: ["O ficheiro XLSX não contém folhas"] });
  }
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  return rows.map(normalizeRow);
}

export function parseImportFile(buffer: Buffer, fileName: string): StudentImportRow[] {
  const extension = fileName.toLowerCase().slice(fileName.lastIndexOf("."));
  const rows = extension === ".xlsx" ? parseXlsx(buffer) : parseCsv(buffer);
  if (rows.length === 0) {
    throw new ValidationError("Dados inválidos", { file: ["O ficheiro não contém linhas de dados"] });
  }
  if (rows.length > MAX_ROWS) {
    throw new ValidationError("Dados inválidos", {
      file: [`O ficheiro excede o limite de ${MAX_ROWS} linhas`],
    });
  }
  return rows;
}

export function buildCsvTemplate(): string {
  return Papa.unparse({ fields: [...TEMPLATE_COLUMNS], data: [] });
}

export function buildXlsxTemplate(): Buffer {
  const sheet = XLSX.utils.aoa_to_sheet([[...TEMPLATE_COLUMNS]]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Alunos");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
