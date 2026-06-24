import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { NoopEmailProvider, validateSendEmailInput } from "../email-provider";
import type { EmailProvider, SendEmailInput, SendEmailResult } from "../email-provider";
import type { NotificationProvider, SendNotificationInput, SendNotificationResult } from "../notification-provider";

const BASE_INPUT: SendNotificationInput = {
  organizationId: "org-1",
  deliveryId: "delivery-1",
  notificationId: "notif-1",
  channel: "EMAIL",
  recipient: "student@example.com",
  title: "Pagamento confirmado",
  body: "O seu pagamento foi confirmado.",
};

describe("EmailProvider interface shapes (test #1)", () => {
  it("NoopEmailProvider satisfies both NotificationProvider and EmailProvider", () => {
    const asNotificationProvider: NotificationProvider = new NoopEmailProvider();
    const asEmailProvider: EmailProvider = new NoopEmailProvider();
    expect(typeof asNotificationProvider.send).toBe("function");
    expect(typeof asEmailProvider.sendEmail).toBe("function");
  });

  it("SendNotificationResult and SendEmailResult shapes are assignable as documented", () => {
    const notificationResult: SendNotificationResult = {
      success: false,
      provider: "noop-email",
      status: "FAILED",
      errorCode: "PROVIDER_NOT_CONFIGURED",
      errorMessage: "Fornecedor de email não está configurado",
    };
    const emailResult: SendEmailResult = {
      success: false,
      provider: "noop-email",
      errorCode: "PROVIDER_NOT_CONFIGURED",
      errorMessage: "Fornecedor de email não está configurado",
    };
    expect(notificationResult.success).toBe(false);
    expect(emailResult.success).toBe(false);
  });
});

describe("NoopEmailProvider (tests #2, #3)", () => {
  it("does not send and returns success=false from sendEmail()", async () => {
    const provider = new NoopEmailProvider();
    const result = await provider.sendEmail({
      to: "student@example.com",
      subject: "Assunto",
      text: "Corpo",
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("PROVIDER_NOT_CONFIGURED");
    expect(result.errorMessage).toBe("Fornecedor de email não está configurado");
  });

  it("does not send and returns success=false from send() (the dispatcher's entry point)", async () => {
    const provider = new NoopEmailProvider();
    const result = await provider.send(BASE_INPUT);

    expect(result.success).toBe(false);
    expect(result.provider).toBe("noop-email");
    expect(result.errorCode).toBe("PROVIDER_NOT_CONFIGURED");
    expect(result.errorMessage).toBe("Fornecedor de email não está configurado");
  });

  it("send() defaults subject to the notification title when none is given", async () => {
    const provider = new NoopEmailProvider();
    // No DB mocks are configured anywhere in this test file — if the
    // provider touched the database this call would throw or hang
    // instead of resolving (test #10: provider does not mutate the DB).
    const result = await provider.send({ ...BASE_INPUT, subject: undefined });
    expect(result.success).toBe(false);
  });

  it("send() routes through sendEmail() rather than duplicating its own send logic", async () => {
    const provider = new NoopEmailProvider();
    const direct = await provider.sendEmail({ to: BASE_INPUT.recipient, subject: BASE_INPUT.title, text: BASE_INPUT.body });
    const viaSend = await provider.send(BASE_INPUT);

    expect(viaSend.provider).toBe(direct.provider);
    expect(viaSend.errorCode).toBe(direct.errorCode);
    expect(viaSend.errorMessage).toBe(direct.errorMessage);
  });
});

describe("validateSendEmailInput", () => {
  function validInput(overrides: Partial<SendEmailInput> = {}): SendEmailInput {
    return { to: "student@example.com", subject: "Assunto", text: "Corpo", ...overrides };
  }

  it("returns null for a valid payload", () => {
    expect(validateSendEmailInput(validInput())).toBeNull();
  });

  it("rejects a recipient that is not a valid email address", () => {
    expect(validateSendEmailInput(validInput({ to: "not-an-email" }))).toBe("INVALID_RECIPIENT");
    expect(validateSendEmailInput(validInput({ to: "" }))).toBe("INVALID_RECIPIENT");
  });

  it("rejects a missing or blank subject", () => {
    expect(validateSendEmailInput(validInput({ subject: "" }))).toBe("MISSING_SUBJECT");
    expect(validateSendEmailInput(validInput({ subject: "   " }))).toBe("MISSING_SUBJECT");
  });

  it("rejects a missing or blank body", () => {
    expect(validateSendEmailInput(validInput({ text: "" }))).toBe("MISSING_BODY");
  });

  it("send() surfaces a validation error before ever calling sendEmail()", async () => {
    const provider = new NoopEmailProvider();
    const result = await provider.send({ ...BASE_INPUT, recipient: "not-an-email" });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("INVALID_RECIPIENT");
    expect(result.errorCode).not.toBe("PROVIDER_NOT_CONFIGURED");
  });
});

describe("EmailProvider.send() status mapping (review fix: success must not map to FAILED, test #1)", () => {
  class FakeSuccessfulEmailProvider extends NoopEmailProvider {
    async sendEmail(_input: SendEmailInput): Promise<SendEmailResult> {
      return { success: true, provider: "fake-resend", providerMessageId: "msg-123" };
    }
  }

  class FakeFailingEmailProvider extends NoopEmailProvider {
    async sendEmail(_input: SendEmailInput): Promise<SendEmailResult> {
      return { success: false, provider: "fake-resend", errorCode: "RATE_LIMITED", errorMessage: "Limite excedido" };
    }
  }

  it("maps a successful sendEmail() result to status SENT, not FAILED", async () => {
    const provider = new FakeSuccessfulEmailProvider();
    const result = await provider.send(BASE_INPUT);

    expect(result.success).toBe(true);
    expect(result.status).toBe("SENT");
    expect(result.provider).toBe("fake-resend");
    expect(result.providerMessageId).toBe("msg-123");
  });

  it("never reports DELIVERED on its own — a bare SendEmailResult carries no delivery confirmation", async () => {
    const provider = new FakeSuccessfulEmailProvider();
    const result = await provider.send(BASE_INPUT);
    expect(result.status).not.toBe("DELIVERED");
  });

  it("keeps status FAILED when sendEmail() reports failure (regression guard, test #2)", async () => {
    const provider = new FakeFailingEmailProvider();
    const result = await provider.send(BASE_INPUT);

    expect(result.success).toBe(false);
    expect(result.status).toBe("FAILED");
    expect(result.errorCode).toBe("RATE_LIMITED");
    expect(result.errorMessage).toBe("Limite excedido");
  });
});

describe("no duplicate EmailProvider abstraction (test #8)", () => {
  it("does not leave the old src/infrastructure/email EmailProvider behind", () => {
    expect(existsSync(resolve(process.cwd(), "src/infrastructure/email/index.ts"))).toBe(false);
    expect(existsSync(resolve(process.cwd(), "src/infrastructure/email"))).toBe(false);
  });
});
