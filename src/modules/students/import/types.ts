import type { ImportJobStatus } from "@/modules/import-jobs/types";

// =============================================================================
// STUDENTS IMPORT — TYPES
// Generic job-level types (ImportJob, ImportJobStatus) live in
// @/modules/import-jobs/types — this file only holds Students-specific
// row shapes.
// =============================================================================

export interface StudentImportRow {
  firstName: string;
  lastName?: string;
  gender?: string;
  birthDate?: string;
  phone?: string;
  email?: string;
  documentType?: string;
  documentNumber?: string;
  address?: string;
}

export type ImportRowState = "VALID" | "WARNING" | "ERROR";

export interface ImportRowResult {
  rowNumber: number;
  data: StudentImportRow;
  state: ImportRowState;
  messages: string[];
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
  data: StudentImportRow;
  outcome: ImportRowOutcome;
  messages: string[];
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
