import { teacherImportRowSchema } from "@/modules/teachers/import/schemas/import.schema";
import type {
  ImportRowIssue,
  ImportRowResult,
  ImportRowState,
  TeacherImportRow,
  ValidationResult,
} from "@/modules/teachers/import/types";

// =============================================================================
// ROW VALIDATOR SERVICE
// Pure function — no DB access. The caller pre-fetches the sets of
// documentNumbers and emails that already exist in the organization (two bulk
// queries) and passes them in, so validating 5000 rows never issues thousands
// of queries. Mirrors @/modules/students/import/services/row-validator.service
// — duplicated rather than imported, matching this codebase's convention of
// each entity's import module owning its own row-shape-specific validation.
// =============================================================================

export const VALID_GENDERS = new Set(["MALE", "FEMALE", "OTHER"]);
export const VALID_DOCUMENT_TYPES = new Set(["BI", "PASSPORT", "NUIT", "OTHER"]);
export const VALID_TEACHER_STATUSES = new Set(["ACTIVE", "INACTIVE", "SUSPENDED"]);

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
  row: TeacherImportRow,
  rowNumber: number,
  existingDocNumbers: Set<string>,
  existingEmails: Set<string>,
  seenDocNumbersInFile: Set<string>,
  seenEmailsInFile: Set<string>
): ImportRowResult {
  let state: ImportRowState = "VALID";
  const issues: ImportRowIssue[] = [];

  const parsed = teacherImportRowSchema.safeParse(row);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      issues.push({
        field: String(issue.path[0] ?? "geral"),
        message: issue.message,
        severity: "ERROR",
      });
    }
    state = escalate(state, "ERROR");
  }

  if (row.birthDate && !parseImportDate(row.birthDate)) {
    issues.push({ field: "birthDate", message: "Data de nascimento inválida", severity: "ERROR" });
    state = escalate(state, "ERROR");
  }

  if (row.hireDate && !parseImportDate(row.hireDate)) {
    issues.push({ field: "hireDate", message: "Data de admissão inválida", severity: "ERROR" });
    state = escalate(state, "ERROR");
  }

  const docNumber = row.documentNumber?.trim() ?? "";
  if (docNumber) {
    if (seenDocNumbersInFile.has(docNumber)) {
      issues.push({
        field: "documentNumber",
        message: "Número de documento duplicado no ficheiro",
        severity: "ERROR",
      });
      state = escalate(state, "ERROR");
    } else if (existingDocNumbers.has(docNumber)) {
      issues.push({
        field: "documentNumber",
        message: "Já existe um professor com este número de documento nesta organização",
        severity: "ERROR",
      });
      state = escalate(state, "ERROR");
    }
    seenDocNumbersInFile.add(docNumber);
  }

  const email = row.email?.trim() ?? "";
  if (email) {
    if (seenEmailsInFile.has(email)) {
      issues.push({ field: "email", message: "Email duplicado no ficheiro", severity: "WARNING" });
      state = escalate(state, "WARNING");
    } else if (existingEmails.has(email)) {
      issues.push({
        field: "email",
        message: "Já existe um professor com este email nesta organização",
        severity: "WARNING",
      });
      state = escalate(state, "WARNING");
    }
    seenEmailsInFile.add(email);
  }

  const gender = row.gender?.trim().toUpperCase() ?? "";
  if (gender && !VALID_GENDERS.has(gender)) {
    issues.push({
      field: "gender",
      message: `Género "${row.gender}" não reconhecido — será deixado em branco`,
      severity: "WARNING",
    });
    state = escalate(state, "WARNING");
  }

  const documentType = row.documentType?.trim().toUpperCase() ?? "";
  if (documentType && !VALID_DOCUMENT_TYPES.has(documentType)) {
    issues.push({
      field: "documentType",
      message: `Tipo de documento "${row.documentType}" não reconhecido — definido como "Outro"`,
      severity: "WARNING",
    });
    state = escalate(state, "WARNING");
  }

  const status = row.status?.trim().toUpperCase() ?? "";
  if (status && !VALID_TEACHER_STATUSES.has(status)) {
    issues.push({
      field: "status",
      message: `Estado "${row.status}" não reconhecido — definido como "Ativo"`,
      severity: "WARNING",
    });
    state = escalate(state, "WARNING");
  }

  return {
    rowNumber,
    data: row,
    state,
    messages: issues.map((i) => i.message),
    issues,
  };
}

export function validateRows(
  rows: TeacherImportRow[],
  existingDocNumbers: Set<string>,
  existingEmails: Set<string>
): ValidationResult {
  const seenDocNumbersInFile = new Set<string>();
  const seenEmailsInFile = new Set<string>();
  const results = rows.map((row, index) =>
    validateRow(row, index + 1, existingDocNumbers, existingEmails, seenDocNumbersInFile, seenEmailsInFile)
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
