import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

const { sendMail, createTransport } = vi.hoisted(() => ({
  sendMail: vi.fn(),
  createTransport: vi.fn(),
}));

vi.mock("nodemailer", () => ({
  default: { createTransport },
  createTransport,
}));

import { SmtpEmailProvider } from "../smtp-email-provider";

const CONFIG = {
  host: "smtp.example.com",
  port: 587,
  secure: true,
  username: "user@example.com",
  password: "super-secret-password",
  fromName: "Escola",
  fromEmail: "noreply@escola.pt",
};

beforeEach(() => {
  vi.clearAllMocks();
  createTransport.mockReturnValue({ sendMail });
});

describe("SmtpEmailProvider.sendEmail — success (test #6)", () => {
  it("maps a successful send to success=true with a providerMessageId", async () => {
    sendMail.mockResolvedValue({ messageId: "msg-123" });
    const provider = new SmtpEmailProvider(CONFIG);

    const result = await provider.sendEmail({ to: "student@example.com", subject: "Assunto", text: "Corpo" });

    expect(result).toEqual({ success: true, provider: "smtp", providerMessageId: "msg-123" });
    expect(createTransport).toHaveBeenCalledWith({
      host: CONFIG.host,
      port: CONFIG.port,
      secure: CONFIG.secure,
      auth: { user: CONFIG.username, pass: CONFIG.password },
    });
  });

  it("send() (the dispatcher's entry point) maps success to status SENT", async () => {
    sendMail.mockResolvedValue({ messageId: "msg-123" });
    const provider = new SmtpEmailProvider(CONFIG);

    const result = await provider.send({
      organizationId: "org-1",
      deliveryId: "delivery-1",
      notificationId: "notif-1",
      channel: "EMAIL",
      recipient: "student@example.com",
      title: "Título",
      body: "Corpo",
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe("SENT");
    expect(result.providerMessageId).toBe("msg-123");
  });
});

describe("SmtpEmailProvider.sendEmail — failure mapping (test #7)", () => {
  it("maps EAUTH to SMTP_AUTH_FAILED", async () => {
    sendMail.mockRejectedValue({ code: "EAUTH", message: "invalid login" });
    const provider = new SmtpEmailProvider(CONFIG);

    const result = await provider.sendEmail({ to: "student@example.com", subject: "Assunto", text: "Corpo" });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("SMTP_AUTH_FAILED");
    expect(result.errorMessage).toBe("Falha de autenticação SMTP");
  });

  it.each(["ECONNECTION", "ETIMEDOUT", "ESOCKET", "ECONNREFUSED"])(
    "maps %s to SMTP_CONNECTION_FAILED",
    async (code) => {
      sendMail.mockRejectedValue({ code });
      const provider = new SmtpEmailProvider(CONFIG);

      const result = await provider.sendEmail({ to: "student@example.com", subject: "Assunto", text: "Corpo" });

      expect(result.errorCode).toBe("SMTP_CONNECTION_FAILED");
      expect(result.errorMessage).toBe("Falha de ligação ao servidor SMTP");
    }
  );

  it.each([421, 450, 451])("maps SMTP response code %i to RATE_LIMITED", async (responseCode) => {
    sendMail.mockRejectedValue({ responseCode });
    const provider = new SmtpEmailProvider(CONFIG);

    const result = await provider.sendEmail({ to: "student@example.com", subject: "Assunto", text: "Corpo" });

    expect(result.errorCode).toBe("RATE_LIMITED");
    expect(result.errorMessage).toBe("Limite de envio excedido");
  });

  it("maps an unrecognized error to UNKNOWN_FAILURE without leaking the raw message", async () => {
    sendMail.mockRejectedValue(new Error("some internal transport detail with the password abc123"));
    const provider = new SmtpEmailProvider(CONFIG);

    const result = await provider.sendEmail({ to: "student@example.com", subject: "Assunto", text: "Corpo" });

    expect(result.errorCode).toBe("UNKNOWN_FAILURE");
    expect(result.errorMessage).toBe("Falha desconhecida ao enviar o email");
    expect(result.errorMessage).not.toContain("abc123");
  });

  it("send() (the dispatcher's entry point) maps failure to status FAILED", async () => {
    sendMail.mockRejectedValue({ code: "EAUTH" });
    const provider = new SmtpEmailProvider(CONFIG);

    const result = await provider.send({
      organizationId: "org-1",
      deliveryId: "delivery-1",
      notificationId: "notif-1",
      channel: "EMAIL",
      recipient: "student@example.com",
      title: "Título",
      body: "Corpo",
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe("FAILED");
    expect(result.errorCode).toBe("SMTP_AUTH_FAILED");
  });
});

describe("SmtpEmailProvider — secrets not logged/exposed (test #8)", () => {
  it("never includes the SMTP password in a sendEmail result, success or failure", async () => {
    sendMail.mockResolvedValue({ messageId: "msg-1" });
    const provider = new SmtpEmailProvider(CONFIG);
    const successResult = await provider.sendEmail({ to: "student@example.com", subject: "Assunto", text: "Corpo" });
    expect(JSON.stringify(successResult)).not.toContain(CONFIG.password);

    sendMail.mockRejectedValue({ code: "EAUTH" });
    const failureResult = await provider.sendEmail({ to: "student@example.com", subject: "Assunto", text: "Corpo" });
    expect(JSON.stringify(failureResult)).not.toContain(CONFIG.password);
  });

  it("does not console.log/console.error the password when a send fails", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    sendMail.mockRejectedValue({ code: "EAUTH" });
    const provider = new SmtpEmailProvider(CONFIG);

    await provider.sendEmail({ to: "student@example.com", subject: "Assunto", text: "Corpo" });

    const allLoggedText = [...logSpy.mock.calls, ...errorSpy.mock.calls].flat().map(String).join(" ");
    expect(allLoggedText).not.toContain(CONFIG.password);

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });
});

describe("SmtpEmailProvider — invalid input rejected safely (test #9)", () => {
  it("rejects an invalid recipient before ever calling nodemailer", async () => {
    const provider = new SmtpEmailProvider(CONFIG);

    const result = await provider.sendEmail({ to: "not-an-email", subject: "Assunto", text: "Corpo" });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("INVALID_RECIPIENT");
    expect(createTransport).not.toHaveBeenCalled();
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("rejects a missing subject before ever calling nodemailer", async () => {
    const provider = new SmtpEmailProvider(CONFIG);

    const result = await provider.sendEmail({ to: "student@example.com", subject: "", text: "Corpo" });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("MISSING_SUBJECT");
    expect(createTransport).not.toHaveBeenCalled();
  });

  it("never throws — always resolves with a safe SendEmailResult", async () => {
    sendMail.mockRejectedValue(new TypeError("boom"));
    const provider = new SmtpEmailProvider(CONFIG);

    await expect(
      provider.sendEmail({ to: "student@example.com", subject: "Assunto", text: "Corpo" })
    ).resolves.toMatchObject({ success: false });
  });
});
