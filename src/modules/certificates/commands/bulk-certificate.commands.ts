import { AuthorizationError, BaseCommand, ValidationError } from "@/shared/lib/command";
import type { ServiceContext } from "@/shared/types/common";
import { createAbility, getUserPermissions } from "@/server/auth/rbac";
import { PERMISSIONS, type Permission } from "@/server/auth/permissions";
import type { BulkCommandDeps, BulkOperationResult } from "@/modules/certificates/types/bulk";
import type { CertificateExportResultDto } from "@/modules/certificates/types/export";
import {
  bulkExportCertificatesSchema,
  bulkGenerateCertificatesSchema,
  bulkIssueCertificatesSchema,
  bulkRestoreCertificatesSchema,
  bulkRevokeCertificatesSchema,
  bulkSuspendCertificatesSchema,
  type BulkExportCertificatesInput,
  type BulkGenerateCertificatesInput,
  type BulkIssueCertificatesInput,
  type BulkRestoreCertificatesInput,
  type BulkRevokeCertificatesInput,
  type BulkSuspendCertificatesInput,
  type ExportCertificateInput,
  type GenerateCertificateInput,
  type IssueCertificateInput,
  type RestoreCertificateInput,
  type RevokeCertificateInput,
  type SuspendCertificateInput,
} from "@/modules/certificates/schemas/certificate.schema";
import { GenerateCertificateCommand, type GenerateCertificateResult } from "./generate-certificate.command";
import { IssueCertificateCommand, type IssueCertificateResult } from "./issue-certificate.command";
import { ExportCertificateCommand } from "./export-certificate.command";
import { RevokeCertificateCommand, type RevokeCertificateResult } from "./revoke-certificate.command";
import { SuspendCertificateCommand, type SuspendCertificateResult } from "./suspend-certificate.command";
import { RestoreCertificateCommand, type RestoreCertificateResult } from "./restore-certificate.command";
import { runBulkSequential } from "./bulk-shared";

// =============================================================================
// BULK CERTIFICATE COMMANDS (Phase 13) — orchestration only
// -----------------------------------------------------------------------------
// Each bulk command runs the CORRESPONDING single-item command once per item,
// sequentially, each in its OWN transaction (via the single command). The bulk
// layer duplicates NO business rule, reads NO Academic Core / Transcript, calls NO
// eligibility engine, and touches NO repository — every item goes through an
// existing command. Authorization is checked ONCE up front (the single commands
// still authorize per item internally, unchanged). A per-item failure is captured
// (never thrown); `stopOnFailure` stops the run and marks the rest skipped.
//
// `onProgress` / a test `runItem` override are passed via the constructor `deps`
// (functions, never part of the HTTP input).
// =============================================================================

async function requirePermission(context: ServiceContext, permission: Permission): Promise<void> {
  const perms = await getUserPermissions(context.userId, context.organizationId);
  if (!createAbility(perms).can(permission)) {
    throw new AuthorizationError();
  }
}

// ─── Generate ────────────────────────────────────────────────────────────────

export class BulkGenerateCertificatesCommand extends BaseCommand<
  BulkGenerateCertificatesInput,
  BulkOperationResult<GenerateCertificateInput, GenerateCertificateResult>
> {
  private readonly deps: BulkCommandDeps<GenerateCertificateInput, GenerateCertificateResult>;
  constructor(
    input: BulkGenerateCertificatesInput,
    context: ServiceContext,
    deps: BulkCommandDeps<GenerateCertificateInput, GenerateCertificateResult> = {}
  ) {
    super(input, context);
    this.deps = deps;
  }
  async validate(): Promise<void> {
    const parsed = bulkGenerateCertificatesSchema.safeParse(this.input);
    if (!parsed.success) throw new ValidationError("Dados inválidos", parsed.error.flatten().fieldErrors);
  }
  async authorize(): Promise<void> {
    await requirePermission(this.context, PERMISSIONS.CERTIFICATES_GENERATE);
  }
  async execute() {
    const parsed = bulkGenerateCertificatesSchema.parse(this.input);
    const items: GenerateCertificateInput[] = parsed.items.map((i) => ({
      transcriptVersionId: i.transcriptVersionId,
      certificateType: i.certificateType,
      policyId: i.policyId,
      courseId: i.courseId,
      reason: parsed.reason,
    }));
    const runItem = this.deps.runItem ?? ((input: GenerateCertificateInput) => new GenerateCertificateCommand(input, this.context).run());
    return runBulkSequential({ items, stopOnFailure: parsed.stopOnFailure, runItem, onProgress: this.deps.onProgress });
  }
}

// ─── Issue ───────────────────────────────────────────────────────────────────

export class BulkIssueCertificatesCommand extends BaseCommand<
  BulkIssueCertificatesInput,
  BulkOperationResult<IssueCertificateInput, IssueCertificateResult>
> {
  private readonly deps: BulkCommandDeps<IssueCertificateInput, IssueCertificateResult>;
  constructor(
    input: BulkIssueCertificatesInput,
    context: ServiceContext,
    deps: BulkCommandDeps<IssueCertificateInput, IssueCertificateResult> = {}
  ) {
    super(input, context);
    this.deps = deps;
  }
  async validate(): Promise<void> {
    const parsed = bulkIssueCertificatesSchema.safeParse(this.input);
    if (!parsed.success) throw new ValidationError("Dados inválidos", parsed.error.flatten().fieldErrors);
  }
  async authorize(): Promise<void> {
    await requirePermission(this.context, PERMISSIONS.CERTIFICATES_ISSUE);
  }
  async execute() {
    const parsed = bulkIssueCertificatesSchema.parse(this.input);
    const items: IssueCertificateInput[] = parsed.items.map((i) => ({ certificateId: i.certificateId, reason: parsed.reason }));
    const runItem = this.deps.runItem ?? ((input: IssueCertificateInput) => new IssueCertificateCommand(input, this.context).run());
    return runBulkSequential({ items, stopOnFailure: parsed.stopOnFailure, runItem, onProgress: this.deps.onProgress });
  }
}

// ─── Export ──────────────────────────────────────────────────────────────────

export class BulkExportCertificatesCommand extends BaseCommand<
  BulkExportCertificatesInput,
  BulkOperationResult<ExportCertificateInput, CertificateExportResultDto>
> {
  private readonly deps: BulkCommandDeps<ExportCertificateInput, CertificateExportResultDto>;
  constructor(
    input: BulkExportCertificatesInput,
    context: ServiceContext,
    deps: BulkCommandDeps<ExportCertificateInput, CertificateExportResultDto> = {}
  ) {
    super(input, context);
    this.deps = deps;
  }
  async validate(): Promise<void> {
    const parsed = bulkExportCertificatesSchema.safeParse(this.input);
    if (!parsed.success) throw new ValidationError("Dados inválidos", parsed.error.flatten().fieldErrors);
  }
  async authorize(): Promise<void> {
    await requirePermission(this.context, PERMISSIONS.CERTIFICATES_EXPORT);
  }
  async execute() {
    const parsed = bulkExportCertificatesSchema.parse(this.input);
    const items: ExportCertificateInput[] = parsed.items.map((i) => ({ certificateId: i.certificateId, exportType: i.exportType }));
    const runItem = this.deps.runItem ?? ((input: ExportCertificateInput) => new ExportCertificateCommand(input, this.context).run());
    return runBulkSequential({ items, stopOnFailure: parsed.stopOnFailure, runItem, onProgress: this.deps.onProgress });
  }
}

// ─── Revoke ──────────────────────────────────────────────────────────────────

export class BulkRevokeCertificatesCommand extends BaseCommand<
  BulkRevokeCertificatesInput,
  BulkOperationResult<RevokeCertificateInput, RevokeCertificateResult>
> {
  private readonly deps: BulkCommandDeps<RevokeCertificateInput, RevokeCertificateResult>;
  constructor(
    input: BulkRevokeCertificatesInput,
    context: ServiceContext,
    deps: BulkCommandDeps<RevokeCertificateInput, RevokeCertificateResult> = {}
  ) {
    super(input, context);
    this.deps = deps;
  }
  async validate(): Promise<void> {
    const parsed = bulkRevokeCertificatesSchema.safeParse(this.input);
    if (!parsed.success) throw new ValidationError("Dados inválidos", parsed.error.flatten().fieldErrors);
  }
  async authorize(): Promise<void> {
    await requirePermission(this.context, PERMISSIONS.CERTIFICATES_REVOKE);
  }
  async execute() {
    const parsed = bulkRevokeCertificatesSchema.parse(this.input);
    const items: RevokeCertificateInput[] = parsed.items.map((i) => ({ certificateId: i.certificateId, reason: parsed.reason }));
    const runItem = this.deps.runItem ?? ((input: RevokeCertificateInput) => new RevokeCertificateCommand(input, this.context).run());
    return runBulkSequential({ items, stopOnFailure: parsed.stopOnFailure, runItem, onProgress: this.deps.onProgress });
  }
}

// ─── Suspend ─────────────────────────────────────────────────────────────────

export class BulkSuspendCertificatesCommand extends BaseCommand<
  BulkSuspendCertificatesInput,
  BulkOperationResult<SuspendCertificateInput, SuspendCertificateResult>
> {
  private readonly deps: BulkCommandDeps<SuspendCertificateInput, SuspendCertificateResult>;
  constructor(
    input: BulkSuspendCertificatesInput,
    context: ServiceContext,
    deps: BulkCommandDeps<SuspendCertificateInput, SuspendCertificateResult> = {}
  ) {
    super(input, context);
    this.deps = deps;
  }
  async validate(): Promise<void> {
    const parsed = bulkSuspendCertificatesSchema.safeParse(this.input);
    if (!parsed.success) throw new ValidationError("Dados inválidos", parsed.error.flatten().fieldErrors);
  }
  async authorize(): Promise<void> {
    await requirePermission(this.context, PERMISSIONS.CERTIFICATES_SUSPEND);
  }
  async execute() {
    const parsed = bulkSuspendCertificatesSchema.parse(this.input);
    const items: SuspendCertificateInput[] = parsed.items.map((i) => ({ certificateId: i.certificateId, reason: parsed.reason }));
    const runItem = this.deps.runItem ?? ((input: SuspendCertificateInput) => new SuspendCertificateCommand(input, this.context).run());
    return runBulkSequential({ items, stopOnFailure: parsed.stopOnFailure, runItem, onProgress: this.deps.onProgress });
  }
}

// ─── Restore ─────────────────────────────────────────────────────────────────

export class BulkRestoreCertificatesCommand extends BaseCommand<
  BulkRestoreCertificatesInput,
  BulkOperationResult<RestoreCertificateInput, RestoreCertificateResult>
> {
  private readonly deps: BulkCommandDeps<RestoreCertificateInput, RestoreCertificateResult>;
  constructor(
    input: BulkRestoreCertificatesInput,
    context: ServiceContext,
    deps: BulkCommandDeps<RestoreCertificateInput, RestoreCertificateResult> = {}
  ) {
    super(input, context);
    this.deps = deps;
  }
  async validate(): Promise<void> {
    const parsed = bulkRestoreCertificatesSchema.safeParse(this.input);
    if (!parsed.success) throw new ValidationError("Dados inválidos", parsed.error.flatten().fieldErrors);
  }
  async authorize(): Promise<void> {
    // Restore reuses the suspend capability (mirrors RestoreCertificateCommand).
    await requirePermission(this.context, PERMISSIONS.CERTIFICATES_SUSPEND);
  }
  async execute() {
    const parsed = bulkRestoreCertificatesSchema.parse(this.input);
    const items: RestoreCertificateInput[] = parsed.items.map((i) => ({ certificateId: i.certificateId, reason: parsed.reason }));
    const runItem = this.deps.runItem ?? ((input: RestoreCertificateInput) => new RestoreCertificateCommand(input, this.context).run());
    return runBulkSequential({ items, stopOnFailure: parsed.stopOnFailure, runItem, onProgress: this.deps.onProgress });
  }
}
