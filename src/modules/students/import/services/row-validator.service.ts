import { studentImportRowSchema } from "@/modules/students/import/schemas/import.schema";
import type {
  ImportRowResult,
  ImportRowState,
  StudentImportRow,
  ValidationResult,
} from "@/modules/students/import/types";

// =============================================================================
// ROW VALIDATOR SERVICE
// Pure function — no DB access. The caller pre-fetches the set of
// documentNumbers that already exist in the organization (one bulk query)
// and passes it in, so validating 5000 rows never issues 5000 queries.
// =============================================================================

export const VALID_GENDERS = new Set(["MALE", "FEMALE", "OTHER"]);
export const VALID_DOCUMENT_TYPES = new Set(["BI", "PASSPORT", "NUIT", "OTHER"]);

function severityRank(state: ImportRowState): number {
  return state === "ERROR" ? 2 : state === "WARNING" ? 1 : 0;
}

function escalate(current: ImportRowState, next: ImportRowState): ImportRowState {
  return severityRank(next) > severityRank(current) ? next : current;
}

/** Accepts ISO (YYYY-MM-DD) or pt-PT (DD/MM/YYYY). Returns null when unparseable. */
export function parseImportDate(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (iso) {
    const date = new Date(`${trimmed}T00:00:00.000Z`);
    const [, year, month, day] = iso;
    if (
      date.getUTCFullYear() !== Number(year) ||
      date.getUTCMonth() !== Number(month) - 1 ||
      date.getUTCDate() !== Number(day)
    ) {
      return null;
    }
    return date;
  }

  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
  if (dmy) {
    const [, day, month, year] = dmy;
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    if (
      date.getUTCFullYear() !== Number(year) ||
      date.getUTCMonth() !== Number(month) - 1 ||
      date.getUTCDate() !== Number(day)
    ) {
      return null;
    }
    return date;
  }

  return null;
}

function validateRow(
  row: StudentImportRow,
  rowNumber: number,
  existingDocNumbers: Set<string>,
  seenDocNumbersInFile: Set<string>
): ImportRowResult {
  let state: ImportRowState = "VALID";
  const messages: string[] = [];

  const parsed = studentImportRowSchema.safeParse(row);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) messages.push(issue.message);
    state = escalate(state, "ERROR");
  }

  if (row.birthDate && !parseImportDate(row.birthDate)) {
    messages.push("Data de nascimento inválida");
    state = escalate(state, "ERROR");
  }

  const docNumber = row.documentNumber?.trim() ?? "";
  if (docNumber) {
    if (seenDocNumbersInFile.has(docNumber)) {
      messages.push("Número de documento duplicado no ficheiro");
      state = escalate(state, "ERROR");
    } else if (existingDocNumbers.has(docNumber)) {
      messages.push("Já existe um aluno com este número de documento nesta organização");
      state = escalate(state, "ERROR");
    }
    seenDocNumbersInFile.add(docNumber);
  }

  const gender = row.gender?.trim().toUpperCase() ?? "";
  if (gender && !VALID_GENDERS.has(gender)) {
    messages.push(`Género "${row.gender}" não reconhecido — será deixado em branco`);
    state = escalate(state, "WARNING");
  }

  const documentType = row.documentType?.trim().toUpperCase() ?? "";
  if (documentType && !VALID_DOCUMENT_TYPES.has(documentType)) {
    messages.push(`Tipo de documento "${row.documentType}" não reconhecido — definido como "Outro"`);
    state = escalate(state, "WARNING");
  }

  return { rowNumber, data: row, state, messages };
}

export function validateRows(
  rows: StudentImportRow[],
  existingDocNumbers: Set<string>
): ValidationResult {
  const seenDocNumbersInFile = new Set<string>();
  const results = rows.map((row, index) =>
    validateRow(row, index + 1, existingDocNumbers, seenDocNumbersInFile)
  );

  return {
    jobId: "",
    totalRows: results.length,
    validRows: results.filter((r) => r.state === "VALID").length,
    warningRows: results.filter((r) => r.state === "WARNING").length,
    errorRows: results.filter((r) => r.state === "ERROR").length,
    rows: results,
  };
}
