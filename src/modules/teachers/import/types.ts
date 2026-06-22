import type { ImportJobStatus } from "@/modules/import-jobs/types";

// =============================================================================
// TEACHERS IMPORT — TYPES
// Generic job-level types (ImportJob, ImportJobStatus) live in
// @/modules/import-jobs/types — this file only holds Teachers-specific
// row shapes. Mirrors @/modules/students/import/types, with two additions:
// `issues` carries a structured (field, message, severity) tuple per problem
// so the error report CSV can break messages down by field — the flat
// `messages: string[]` is kept alongside for cheap preview-table display.
// =============================================================================

export interface TeacherImportRow {
  firstName: string;
  lastName?: string;
  gender?: string;
  birthDate?: string;
  phone?: string;
  email?: string;
  documentType?: string;
  documentNumber?: string;
  address?: string;
  specialization?: string;
  hireDate?: string;
  status?: string;
}

export type ImportRowState = "VALID" | "WARNING" | "ERROR";

export interface ImportRowIssue {
  field: string;
  message: string;
  severity: "ERROR" | "WARNING";
}

export interface ImportRowResult {
  rowNumber: number;
  data: TeacherImportRow;
  state: ImportRowState;
  messages: string[];
  issues: ImportRowIssue[];
}

export interface ValidationResult {
  jobId: string;
  totalRows: number;
  validRows: number;
  warningRows: number;
  errorRows: number;
  rows: ImportRowResult[];
}

export type ImportRowOutcome = "IMPORTED" | "SKIPPED" | "FAILED";

export interface ImportRowExecutionResult {
  rowNumber: number;
  data: TeacherImportRow;
  outcome: ImportRowOutcome;
  messages: string[];
  issues: ImportRowIssue[];
}

export interface ImportReport {
  jobId: string;
  status: ImportJobStatus;
  totalRows: number;
  importedCount: number;
  skippedCount: number;
  failedCount: number;
  startedAt: Date | null;
  completedAt: Date | null;
  durationMs: number | null;
  rows: ImportRowExecutionResult[];
}

export const IMPORT_ROW_STATE_LABELS: Record<ImportRowState, string> = {
  VALID: "Válido",
  WARNING: "Aviso",
  ERROR: "Erro",
};
