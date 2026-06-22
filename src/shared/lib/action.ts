import { Prisma } from "@prisma/client";
import type { ActionResult } from "@/shared/types/common";
import {
  AuthorizationError,
  BusinessRuleError,
  NotFoundError,
  ValidationError,
} from "@/shared/lib/command";

// =============================================================================
// SERVER ACTION WRAPPER
// Wraps command execution in a try/catch and normalizes errors into
// ActionResult so the client always receives a typed response.
// =============================================================================

export async function runAction<T>(
  fn: () => Promise<T>
): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { success: true, data };
  } catch (error) {
    if (error instanceof ValidationError) {
      return {
        success: false,
        error: error.message,
        fieldErrors: error.fieldErrors,
      };
    }
    if (error instanceof AuthorizationError) {
      return { success: false, error: error.message };
    }
    if (error instanceof NotFoundError) {
      return { success: false, error: error.message };
    }
    if (error instanceof BusinessRuleError) {
      return { success: false, error: error.message };
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { success: false, error: "Já existe um registo com estes dados" };
    }
    console.error("[action-error]", error);
    return { success: false, error: "Ocorreu um erro inesperado" };
  }
}
