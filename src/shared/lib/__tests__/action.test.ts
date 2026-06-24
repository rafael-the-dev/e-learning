import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { runAction } from "../action";
import { ValidationError, AuthorizationError, NotFoundError, BusinessRuleError, ConcurrencyError } from "../command";

describe("runAction", () => {
  it("returns success with data when fn resolves", async () => {
    const result = await runAction(async () => "ok");
    expect(result).toEqual({ success: true, data: "ok" });
  });

  it("maps ValidationError to a field-error response", async () => {
    const result = await runAction(async () => {
      throw new ValidationError("Dados inválidos", { name: ["obrigatório"] });
    });
    expect(result).toEqual({
      success: false,
      error: "Dados inválidos",
      fieldErrors: { name: ["obrigatório"] },
    });
  });

  it("maps AuthorizationError, NotFoundError, BusinessRuleError to their messages", async () => {
    await expect(
      runAction(async () => {
        throw new AuthorizationError("Sem permissão");
      })
    ).resolves.toEqual({ success: false, error: "Sem permissão" });

    await expect(
      runAction(async () => {
        throw new NotFoundError("Role", "role-1");
      })
    ).resolves.toMatchObject({ success: false });

    await expect(
      runAction(async () => {
        throw new BusinessRuleError("Regra de negócio violada");
      })
    ).resolves.toEqual({ success: false, error: "Regra de negócio violada" });
  });

  it("maps ConcurrencyError to a user-friendly PT message", async () => {
    const result = await runAction(async () => {
      throw new ConcurrencyError("NotificationDelivery", "delivery-1");
    });
    expect(result).toEqual({
      success: false,
      error: "Este registo foi alterado por outro processo. Atualize a página e tente novamente",
    });
  });

  it("maps a Prisma P2002 unique-constraint violation to a clean PT message", async () => {
    const result = await runAction(async () => {
      throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "7.8.0",
      });
    });
    expect(result).toEqual({ success: false, error: "Já existe um registo com estes dados" });
  });

  it("falls back to a generic PT message for unrecognized errors", async () => {
    const result = await runAction(async () => {
      throw new Error("boom");
    });
    expect(result).toEqual({ success: false, error: "Ocorreu um erro inesperado" });
  });
});
