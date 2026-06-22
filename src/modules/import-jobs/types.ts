// =============================================================================
// IMPORT JOBS — SHARED TYPES
// Generic ImportJob entity, reusable across every import type in the system.
// Type-specific row shapes (e.g. StudentImportRow) live in their own module
// (src/modules/students/import/types.ts) and are cast at that boundary.
// =============================================================================

export const IMPORT_JOB_TYPES = [
  "STUDENTS",
  "TEACHERS",
  "ENROLLMENTS",
  "CLASS_GROUPS",
  "COURSES",
  "SUBJECTS",
] as const;
export type ImportJobType = (typeof IMPORT_JOB_TYPES)[number];

export const IMPORT_JOB_STATUSES = [
  "PENDING",
  "VALIDATED",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
] as const;
export type ImportJobStatus = (typeof IMPORT_JOB_STATUSES)[number];

export interface ImportValidationSummary {
  totalRows: number;
  validRows: number;
  warningRows: number;
  errorRows: number;
}

export interface ImportExecutionSummary {
  successRows: number;
  failedRows: number;
  durationMs: number;
}

export interface ImportJob {
  id: string;
  organizationId: string;
  type: ImportJobType;
  status: ImportJobStatus;
  uploadedFileName: string;
  totalRows: number;
  successRows: number;
  failedRows: number;
  rowsData: unknown[] | null;
  resultData: unknown[] | null;
  validationSummary: ImportValidationSummary | null;
  executionSummary: ImportExecutionSummary | null;
  startedAt: Date | null;
  completedAt: Date | null;
  uploadedById: string | null;
  uploadedByName: string | null;
  createdAt: Date;
}

export interface ImportJobListItem {
  id: string;
  type: ImportJobType;
  status: ImportJobStatus;
  uploadedFileName: string;
  totalRows: number;
  successRows: number;
  failedRows: number;
  uploadedByName: string | null;
  createdAt: Date;
}

export interface ImportJobFilters {
  search?: string;
  type?: ImportJobType;
  status?: ImportJobStatus;
  uploadedById?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface ImportJobKPIs {
  totalImports: number;
  importsToday: number;
  successfulImports: number;
  failedImports: number;
  totalRecordsImported: number;
  successRate: number;
}

export interface ImportJobEventEntry {
  id: string;
  action: string;
  actorId: string | null;
  actorName: string | null;
  createdAt: Date;
}

export const IMPORT_JOB_TYPE_LABELS: Record<ImportJobType, string> = {
  STUDENTS: "Alunos",
  TEACHERS: "Professores",
  ENROLLMENTS: "Matrículas",
  CLASS_GROUPS: "Turmas",
  COURSES: "Cursos",
  SUBJECTS: "Disciplinas",
};

export const IMPORT_JOB_STATUS_LABELS: Record<ImportJobStatus, string> = {
  PENDING: "Pendente",
  VALIDATED: "Validado",
  PROCESSING: "A processar",
  COMPLETED: "Concluído",
  FAILED: "Falhado",
};

export const IMPORT_JOB_EVENT_LABELS: Record<string, string> = {
  "import.job.created": "Job criado",
  "import.job.validated": "Validação concluída",
  "import.job.processing": "Processamento iniciado",
  "import.job.completed": "Importação concluída",
  "import.job.failed": "Importação falhada",
};
