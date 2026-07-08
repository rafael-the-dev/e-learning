import type { ServiceContext } from "@/shared/types/common";

// =============================================================================
// COMMAND PATTERN
// All critical operations are modelled as Commands.
// Commands validate input, authorize the actor, execute business logic,
// and optionally support undo. They are the single authoritative entry point
// for any state-mutating operation.
// =============================================================================

export interface Command<TResult = void> {
  validate(): Promise<void>;
  authorize(): Promise<void>;
  execute(): Promise<TResult>;
}

export abstract class BaseCommand<TInput, TResult = void>
  implements Command<TResult>
{
  constructor(
    protected readonly input: TInput,
    protected readonly context: ServiceContext
  ) {}

  abstract validate(): Promise<void>;
  abstract authorize(): Promise<void>;
  abstract execute(): Promise<TResult>;

  async run(): Promise<TResult> {
    await this.validate();
    await this.authorize();
    return this.execute();
  }
}

export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly fieldErrors?: Record<string, string[]>
  ) {
    super(message);
    this.name = "ValidationError";
  }
}

export class AuthorizationError extends Error {
  constructor(message = "You do not have permission to perform this action") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export class NotFoundError extends Error {
  constructor(entity: string, id: string) {
    super(`${entity} with id "${id}" not found`);
    this.name = "NotFoundError";
  }
}

export class BusinessRuleError extends Error {
  constructor(
    message: string,
    /** Optional machine-readable context (e.g. `{ blockingReasons, warnings }`)
     *  for callers that surface structured detail. Backward compatible: existing
     *  single-argument callers are unaffected. */
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "BusinessRuleError";
  }
}

/**
 * Thrown when a feature/branch is deliberately not yet implemented and the
 * caller must fail fast rather than receive a silently-incomplete result.
 * Used by the Academic Transcript Snapshot Builder for transcript types not
 * supported in the current phase.
 */
export class NotImplementedError extends Error {
  constructor(feature: string) {
    super(`${feature} is not implemented`);
    this.name = "NotImplementedError";
  }
}

/**
 * Thrown when a conditional update (WHERE ... AND status = expected) affects
 * zero rows — the record was modified by another process between the read
 * and the write. Distinct from BusinessRuleError: this is a transient race,
 * not an invalid request; callers should retry the read-modify-write cycle.
 */
export class ConcurrencyError extends Error {
  constructor(entity: string, id: string) {
    super(`${entity} with id "${id}" was modified concurrently; expected state no longer matches`);
    this.name = "ConcurrencyError";
  }
}
