import type {
  IntegrityIssueSeverity,
  IntegrityIssueCategory,
  IntegrityIssueStatus,
} from "@/shared/types/common";

// =============================================================================
// FINANCIAL INTEGRITY ISSUE DOMAIN TYPE
// =============================================================================

export interface FinancialIntegrityIssue {
  id: string;
  organizationId: string;
  severity: IntegrityIssueSeverity;
  category: IntegrityIssueCategory;
  checkName: string;
  entityType: string;
  entityId: string;
  description: string;
  expectedValue: string | null;
  actualValue: string | null;
  detectedAt: Date;
  jobRunId: string | null;
  status: IntegrityIssueStatus;
  resolvedAt: Date | null;
  resolvedBy: string | null;
  resolutionNotes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// =============================================================================
// DETECTED ISSUE — output of a single check function, before persistence
// =============================================================================

export interface DetectedIssue {
  severity: IntegrityIssueSeverity;
  category: IntegrityIssueCategory;
  checkName: string;
  entityType: string;
  entityId: string;
  description: string;
  expectedValue?: string;
  actualValue?: string;
}

// =============================================================================
// CHECK RESULT — per-category summary after running checks for one org
// =============================================================================

export interface CategoryCheckResult {
  category: IntegrityIssueCategory;
  issuesFound: number;
  newIssues: number;
  reconfirmedIssues: number;
  durationMs: number;
  error?: string;
}

// =============================================================================
// ORG INTEGRITY REPORT — full result for one organization
// =============================================================================

export interface OrgIntegrityReport {
  organizationId: string;
  totalIssues: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  categories: CategoryCheckResult[];
  durationMs: number;
  error?: string;
}

// =============================================================================
// JOB RESULT — full result of a complete integrity check run
// =============================================================================

export interface FinancialIntegrityJobResult {
  jobRunId: string;
  startedAt: Date;
  completedAt: Date;
  organizationsProcessed: number;
  organizationsSkipped: number;
  totalIssuesDetected: number;
  totalNewIssues: number;
  totalReconfirmedIssues: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  orgs: OrgIntegrityReport[];
  errors: Array<{ organizationId: string; error: string }>;
}

// =============================================================================
// LIST PARAMS — for querying issues
// =============================================================================

export interface ListIntegrityIssuesParams {
  organizationId: string;
  status?: IntegrityIssueStatus | IntegrityIssueStatus[];
  severity?: IntegrityIssueSeverity | IntegrityIssueSeverity[];
  category?: IntegrityIssueCategory;
  entityType?: string;
  jobRunId?: string;
  page?: number;
  pageSize?: number;
}
