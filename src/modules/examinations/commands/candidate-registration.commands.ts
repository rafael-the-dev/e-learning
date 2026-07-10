import {
  AuthorizationError,
  BaseCommand,
  ValidationError,
} from "@/shared/lib/command";
import { createAbility, getUserPermissions } from "@/server/auth/rbac";
import { PERMISSIONS, type Permission } from "@/server/auth/permissions";
import {
  overrideExamCandidateEligibilitySchema,
  registerExamCandidateSchema,
  type OverrideExamCandidateEligibilityInput,
  type RegisterExamCandidateInput,
} from "@/modules/examinations/schemas/registration.schema";
import {
  runRegistration,
  type RegisterExamCandidateResult,
} from "./registration-shared";

// =============================================================================
// EXAMINATION ENGINE — CANDIDATE REGISTRATION COMMANDS (Phase 5)
// -----------------------------------------------------------------------------
// `RegisterExamCandidateCommand` (perm `exams.registerCandidates`) is the normal
// path: it registers a candidate ONLY when the session is SCHEDULED and the pure
// engine returns eligible AND not-requiresApproval. `OverrideExamCandidateEligibility
// Command` (perm `exams.overrideEligibility`, mandatory reason) is the admin path:
// it bypasses the ELIGIBILITY verdict ONLY (never the operational blockers) and
// records provenance. Both share `runRegistration` (one tx, engine used verbatim,
// ExamEvent + audit inside the tx, no bus).
// =============================================================================

async function authorize(userId: string, organizationId: string, permission: Permission): Promise<void> {
  const perms = await getUserPermissions(userId, organizationId);
  if (!createAbility(perms).can(permission)) {
    throw new AuthorizationError();
  }
}

// ─── Register (normal) ─────────────────────────────────────────────────────────

export class RegisterExamCandidateCommand extends BaseCommand<
  RegisterExamCandidateInput,
  RegisterExamCandidateResult
> {
  async validate(): Promise<void> {
    const parsed = registerExamCandidateSchema.safeParse(this.input);
    if (!parsed.success) {
      throw new ValidationError("Dados inválidos", parsed.error.flatten().fieldErrors);
    }
  }

  async authorize(): Promise<void> {
    await authorize(this.context.userId, this.context.organizationId, PERMISSIONS.EXAMS_REGISTER_CANDIDATES);
  }

  async execute(): Promise<RegisterExamCandidateResult> {
    const input = registerExamCandidateSchema.parse(this.input);
    return runRegistration(this.context, input, "REGISTER");
  }
}

// ─── Override (admin — bypasses eligibility only) ────────────────────────────────

export class OverrideExamCandidateEligibilityCommand extends BaseCommand<
  OverrideExamCandidateEligibilityInput,
  RegisterExamCandidateResult
> {
  async validate(): Promise<void> {
    const parsed = overrideExamCandidateEligibilitySchema.safeParse(this.input);
    if (!parsed.success) {
      throw new ValidationError("Dados inválidos", parsed.error.flatten().fieldErrors);
    }
  }

  async authorize(): Promise<void> {
    await authorize(this.context.userId, this.context.organizationId, PERMISSIONS.EXAMS_OVERRIDE_ELIGIBILITY);
  }

  async execute(): Promise<RegisterExamCandidateResult> {
    const input = overrideExamCandidateEligibilitySchema.parse(this.input);
    return runRegistration(this.context, input, "OVERRIDE");
  }
}
