import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/modules/notifications/repositories/notification-delivery.repository", () => ({
  findDueDeliveries: vi.fn(),
}));

vi.mock("@/modules/notifications/repositories/notification.repository", () => ({
  findNotificationById: vi.fn(),
}));

vi.mock("@/modules/notifications/services/notification-delivery.service", () => ({
  startProcessing: vi.fn(),
  markSent: vi.fn(),
  markDelivered: vi.fn(),
  markFailed: vi.fn(),
}));

vi.mock("@/modules/notifications/providers/notification-provider-registry", async () => {
  const actual = await vi.importActual<typeof import("@/modules/notifications/providers/notification-provider-registry")>(
    "@/modules/notifications/providers/notification-provider-registry"
  );
  return { getProvider: vi.fn(actual.getProvider) };
});

// The real getProvider() now looks up NotificationEmailSettings for EMAIL —
// default to "no settings row", same observable result (NoopEmailProvider)
// as Phase 3.2A, so every pre-existing assertion below still holds.
vi.mock("@/modules/notifications/repositories/notification-email-settings.repository", () => ({
  findRawByOrganization: vi.fn().mockResolvedValue(null),
}));

import { findDueDeliveries } from "@/modules/notifications/repositories/notification-delivery.repository";
import { findNotificationById } from "@/modules/notifications/repositories/notification.repository";
import { startProcessing, markSent, markDelivered, markFailed } from "@/modules/notifications/services/notification-delivery.service";
import { getProvider } from "@/modules/notifications/providers/notification-provider-registry";
import { dispatchPendingDeliveries } from "../notification-dispatcher.service";
import { ConcurrencyError } from "@/shared/lib/command";

const ORG_ID = "org-1";

function makeDelivery(overrides: Record<string, unknown> = {}) {
  return {
    id: "delivery-1",
    organizationId: ORG_ID,
    notificationId: "notif-1",
    channel: "IN_APP",
    recipient: "user-1@example.com",
    status: "PENDING",
    attempts: 0,
    maxAttempts: 3,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  (findNotificationById as Mock).mockResolvedValue({
    id: "notif-1",
    title: "Notificação de teste",
    message: "Corpo da notificação de teste",
  });
});

describe("dispatchPendingDeliveries — IN_APP (test #25)", () => {
  it("advances a due IN_APP delivery through PROCESSING -> SENT -> DELIVERED", async () => {
    (findDueDeliveries as Mock).mockResolvedValue([makeDelivery({ channel: "IN_APP" })]);

    const result = await dispatchPendingDeliveries(ORG_ID);

    expect(startProcessing).toHaveBeenCalledWith("delivery-1", ORG_ID);
    expect(markSent).toHaveBeenCalledWith("delivery-1", ORG_ID);
    expect(markDelivered).toHaveBeenCalledWith("delivery-1", ORG_ID);
    expect(markFailed).not.toHaveBeenCalled();
    expect(getProvider).not.toHaveBeenCalled();
    expect(result).toEqual({ processed: 1, sent: 0, delivered: 1, failed: 0, providerNotConfigured: 0, errors: 0 });
  });
});

describe("dispatchPendingDeliveries — external channels (tests #26, #27)", () => {
  it("never sends external channels — marks them FAILED with 'Fornecedor não configurado'", async () => {
    (findDueDeliveries as Mock).mockResolvedValue([makeDelivery({ id: "delivery-2", channel: "EMAIL" })]);

    const result = await dispatchPendingDeliveries(ORG_ID);

    expect(startProcessing).toHaveBeenCalledWith("delivery-2", ORG_ID);
    expect(markSent).not.toHaveBeenCalled();
    expect(markDelivered).not.toHaveBeenCalled();
    expect(markFailed).toHaveBeenCalledWith("delivery-2", ORG_ID, "Fornecedor não configurado", "noop-email");
    expect(result).toEqual({ processed: 1, sent: 0, delivered: 0, failed: 1, providerNotConfigured: 1, errors: 0 });
  });

  it("returns an empty summary when there is nothing due", async () => {
    (findDueDeliveries as Mock).mockResolvedValue([]);

    const result = await dispatchPendingDeliveries(ORG_ID);

    expect(startProcessing).not.toHaveBeenCalled();
    expect(result).toEqual({ processed: 0, sent: 0, delivered: 0, failed: 0, providerNotConfigured: 0, errors: 0 });
  });
});

describe("dispatchPendingDeliveries — per-delivery failure isolation (M2)", () => {
  it("logs and continues when one delivery throws (e.g. ConcurrencyError), processing the rest of the batch", async () => {
    (findDueDeliveries as Mock).mockResolvedValue([
      makeDelivery({ id: "delivery-1", channel: "IN_APP" }),
      makeDelivery({ id: "delivery-2", channel: "IN_APP" }),
      makeDelivery({ id: "delivery-3", channel: "IN_APP" }),
    ]);
    (startProcessing as Mock).mockImplementation(async (id: string) => {
      if (id === "delivery-2") {
        throw new ConcurrencyError("NotificationDelivery", id);
      }
      return makeDelivery({ id });
    });
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await dispatchPendingDeliveries(ORG_ID);

    expect(startProcessing).toHaveBeenCalledTimes(3);
    expect(markSent).toHaveBeenCalledTimes(2);
    expect(markDelivered).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ processed: 3, sent: 0, delivered: 2, failed: 0, providerNotConfigured: 0, errors: 1 });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("delivery-2"),
      expect.any(ConcurrencyError)
    );

    consoleErrorSpy.mockRestore();
  });

  it("isolates failures across mixed channels — one throwing delivery does not block others", async () => {
    (startProcessing as Mock).mockReset();
    (findDueDeliveries as Mock).mockResolvedValue([
      makeDelivery({ id: "delivery-1", channel: "EMAIL" }),
      makeDelivery({ id: "delivery-2", channel: "IN_APP" }),
    ]);
    (markFailed as Mock).mockImplementation(async (id: string) => {
      if (id === "delivery-1") {
        throw new Error("boom");
      }
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await dispatchPendingDeliveries(ORG_ID);

    expect(markDelivered).toHaveBeenCalledWith("delivery-2", ORG_ID);
    expect(result).toEqual({ processed: 2, sent: 0, delivered: 1, failed: 0, providerNotConfigured: 0, errors: 1 });
  });

  it("isolates failures when the resolved provider's send() itself throws (test #12)", async () => {
    (findDueDeliveries as Mock).mockResolvedValue([
      makeDelivery({ id: "delivery-1", channel: "EMAIL" }),
      makeDelivery({ id: "delivery-2", channel: "IN_APP" }),
    ]);
    (getProvider as Mock).mockImplementationOnce(() => ({
      send: vi.fn().mockRejectedValue(new Error("provider exploded")),
    }));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await dispatchPendingDeliveries(ORG_ID);

    expect(markDelivered).toHaveBeenCalledWith("delivery-2", ORG_ID);
    expect(result).toEqual({ processed: 2, sent: 0, delivered: 1, failed: 0, providerNotConfigured: 0, errors: 1 });
  });
});

describe("dispatchPendingDeliveries — provider registry integration (Phase 3.2A)", () => {
  it("resolves a provider from the registry for EMAIL deliveries instead of a hardcoded branch (test #6)", async () => {
    (findDueDeliveries as Mock).mockResolvedValue([makeDelivery({ id: "delivery-2", channel: "EMAIL" })]);

    await dispatchPendingDeliveries(ORG_ID);

    expect(getProvider).toHaveBeenCalledWith("EMAIL", ORG_ID);
  });

  it("resolves a not-configured provider from the registry for WHATSAPP/SMS/PUSH", async () => {
    (findDueDeliveries as Mock).mockResolvedValue([
      makeDelivery({ id: "delivery-2", channel: "WHATSAPP" }),
      makeDelivery({ id: "delivery-3", channel: "SMS" }),
      makeDelivery({ id: "delivery-4", channel: "PUSH" }),
    ]);

    const result = await dispatchPendingDeliveries(ORG_ID);

    expect(markFailed).toHaveBeenCalledWith("delivery-2", ORG_ID, "Fornecedor não configurado", "not-configured-whatsapp");
    expect(markFailed).toHaveBeenCalledWith("delivery-3", ORG_ID, "Fornecedor não configurado", "not-configured-sms");
    expect(markFailed).toHaveBeenCalledWith("delivery-4", ORG_ID, "Fornecedor não configurado", "not-configured-push");
    expect(result.failed).toBe(3);
    expect(result.providerNotConfigured).toBe(3);
  });

  it("resolves the notification title/message and passes them as subject/body to the provider (Phase 3.2A §5)", async () => {
    (findDueDeliveries as Mock).mockResolvedValue([
      makeDelivery({ id: "delivery-2", channel: "EMAIL", notificationId: "notif-9", recipient: "person@example.com" }),
    ]);
    (findNotificationById as Mock).mockResolvedValue({
      id: "notif-9",
      title: "Pagamento confirmado",
      message: "O seu pagamento foi confirmado.",
    });
    const sendSpy = vi.fn().mockResolvedValue({
      success: false,
      provider: "noop-email",
      status: "FAILED",
      errorCode: "PROVIDER_NOT_CONFIGURED",
      errorMessage: "Fornecedor de email não está configurado",
    });
    (getProvider as Mock).mockImplementationOnce(() => ({ send: sendSpy }));

    await dispatchPendingDeliveries(ORG_ID);

    expect(findNotificationById).toHaveBeenCalledWith("notif-9", ORG_ID);
    expect(sendSpy).toHaveBeenCalledWith({
      organizationId: ORG_ID,
      deliveryId: "delivery-2",
      notificationId: "notif-9",
      channel: "EMAIL",
      recipient: "person@example.com",
      title: "Pagamento confirmado",
      body: "O seu pagamento foi confirmado.",
    });
  });

  it("never performs real network I/O when dispatching an EMAIL delivery (test #9)", async () => {
    const originalFetch = globalThis.fetch;
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    (findDueDeliveries as Mock).mockResolvedValue([makeDelivery({ id: "delivery-2", channel: "EMAIL" })]);

    await dispatchPendingDeliveries(ORG_ID);

    expect(fetchSpy).not.toHaveBeenCalled();
    globalThis.fetch = originalFetch;
  });
});

describe("dispatchPendingDeliveries — status mapping (review fix: success must not map to FAILED)", () => {
  it("marks SENT (not DELIVERED) when the provider reports success without delivery confirmation (tests #1, #3)", async () => {
    (findDueDeliveries as Mock).mockResolvedValue([makeDelivery({ id: "delivery-2", channel: "EMAIL" })]);
    const sendSpy = vi.fn().mockResolvedValue({
      success: true,
      provider: "fake-email",
      status: "SENT",
      providerMessageId: "msg-1",
    });
    (getProvider as Mock).mockImplementationOnce(() => ({ send: sendSpy }));

    const result = await dispatchPendingDeliveries(ORG_ID);

    expect(markSent).toHaveBeenCalledWith("delivery-2", ORG_ID, "msg-1", "fake-email");
    expect(markDelivered).not.toHaveBeenCalled();
    expect(markFailed).not.toHaveBeenCalled();
    expect(result).toEqual({ processed: 1, sent: 1, delivered: 0, failed: 0, providerNotConfigured: 0, errors: 0 });
  });

  it("marks DELIVERED when the provider explicitly confirms delivery (status DELIVERED)", async () => {
    (findDueDeliveries as Mock).mockResolvedValue([makeDelivery({ id: "delivery-2", channel: "EMAIL" })]);
    const sendSpy = vi.fn().mockResolvedValue({
      success: true,
      provider: "fake-email",
      status: "DELIVERED",
      providerMessageId: "msg-2",
    });
    (getProvider as Mock).mockImplementationOnce(() => ({ send: sendSpy }));

    const result = await dispatchPendingDeliveries(ORG_ID);

    expect(markSent).toHaveBeenCalledWith("delivery-2", ORG_ID, "msg-2", "fake-email");
    expect(markDelivered).toHaveBeenCalledWith("delivery-2", ORG_ID, "msg-2", "fake-email");
    expect(result).toEqual({ processed: 1, sent: 0, delivered: 1, failed: 0, providerNotConfigured: 0, errors: 0 });
  });
});

describe("dispatchPendingDeliveries — failureReason fallback (review fix)", () => {
  it("does not label a generic failure as 'Fornecedor não configurado' when errorCode is missing (test #5)", async () => {
    (findDueDeliveries as Mock).mockResolvedValue([makeDelivery({ id: "delivery-2", channel: "EMAIL" })]);
    const sendSpy = vi.fn().mockResolvedValue({
      success: false,
      provider: "fake-email",
      status: "FAILED",
    });
    (getProvider as Mock).mockImplementationOnce(() => ({ send: sendSpy }));

    await dispatchPendingDeliveries(ORG_ID);

    expect(markFailed).toHaveBeenCalledWith("delivery-2", ORG_ID, "Falha no envio da notificação", "fake-email");
  });

  it("uses the provider's own errorMessage when present and errorCode isn't PROVIDER_NOT_CONFIGURED", async () => {
    (findDueDeliveries as Mock).mockResolvedValue([makeDelivery({ id: "delivery-2", channel: "EMAIL" })]);
    const sendSpy = vi.fn().mockResolvedValue({
      success: false,
      provider: "fake-email",
      status: "FAILED",
      errorCode: "RATE_LIMITED",
      errorMessage: "Limite de envios excedido",
    });
    (getProvider as Mock).mockImplementationOnce(() => ({ send: sendSpy }));

    await dispatchPendingDeliveries(ORG_ID);

    expect(markFailed).toHaveBeenCalledWith("delivery-2", ORG_ID, "Limite de envios excedido", "fake-email");
  });

  it("still maps PROVIDER_NOT_CONFIGURED to 'Fornecedor não configurado' (test #6)", async () => {
    (findDueDeliveries as Mock).mockResolvedValue([makeDelivery({ id: "delivery-2", channel: "EMAIL" })]);
    const sendSpy = vi.fn().mockResolvedValue({
      success: false,
      provider: "fake-email",
      status: "FAILED",
      errorCode: "PROVIDER_NOT_CONFIGURED",
      errorMessage: "some english diagnostic text that must not leak through",
    });
    (getProvider as Mock).mockImplementationOnce(() => ({ send: sendSpy }));

    await dispatchPendingDeliveries(ORG_ID);

    expect(markFailed).toHaveBeenCalledWith("delivery-2", ORG_ID, "Fornecedor não configurado", "fake-email");
  });
});

describe("dispatchPendingDeliveries — DispatchSummary sent/delivered split (test #7)", () => {
  it("counts sent, delivered and providerNotConfigured independently across a mixed batch", async () => {
    (findDueDeliveries as Mock).mockResolvedValue([
      makeDelivery({ id: "delivery-sent", channel: "EMAIL" }),
      makeDelivery({ id: "delivery-in-app", channel: "IN_APP" }),
      makeDelivery({ id: "delivery-not-configured", channel: "WHATSAPP" }),
    ]);
    (getProvider as Mock).mockImplementation((channel: string) => {
      if (channel === "EMAIL") {
        return { send: vi.fn().mockResolvedValue({ success: true, provider: "fake-email", status: "SENT" }) };
      }
      return {
        send: vi.fn().mockResolvedValue({
          success: false,
          provider: `not-configured-${channel.toLowerCase()}`,
          status: "FAILED",
          errorCode: "PROVIDER_NOT_CONFIGURED",
          errorMessage: `Não existe fornecedor configurado para o canal ${channel}`,
        }),
      };
    });

    const result = await dispatchPendingDeliveries(ORG_ID);

    expect(result).toEqual({ processed: 3, sent: 1, delivered: 1, failed: 1, providerNotConfigured: 1, errors: 0 });
  });
});

describe("dispatchPendingDeliveries — failed vs providerNotConfigured (hardening §7)", () => {
  it("increments failed but not providerNotConfigured for a generic provider failure", async () => {
    (findDueDeliveries as Mock).mockResolvedValue([makeDelivery({ id: "delivery-2", channel: "EMAIL" })]);
    const sendSpy = vi.fn().mockResolvedValue({
      success: false,
      provider: "smtp",
      status: "FAILED",
      errorCode: "SMTP_AUTH_FAILED",
      errorMessage: "Falha de autenticação SMTP",
    });
    (getProvider as Mock).mockImplementationOnce(() => ({ send: sendSpy }));

    const result = await dispatchPendingDeliveries(ORG_ID);

    expect(result.failed).toBe(1);
    expect(result.providerNotConfigured).toBe(0);
  });

  it("increments both failed and providerNotConfigured for a PROVIDER_NOT_CONFIGURED failure", async () => {
    (findDueDeliveries as Mock).mockResolvedValue([makeDelivery({ id: "delivery-2", channel: "EMAIL" })]);
    const sendSpy = vi.fn().mockResolvedValue({
      success: false,
      provider: "noop-email",
      status: "FAILED",
      errorCode: "PROVIDER_NOT_CONFIGURED",
      errorMessage: "Fornecedor de email não está configurado",
    });
    (getProvider as Mock).mockImplementationOnce(() => ({ send: sendSpy }));

    const result = await dispatchPendingDeliveries(ORG_ID);

    expect(result.failed).toBe(1);
    expect(result.providerNotConfigured).toBe(1);
  });
});

describe("dispatchPendingDeliveries — provider cache per dispatch run (hardening §4)", () => {
  it("resolves the provider once for two EMAIL deliveries in the same org/run", async () => {
    (findDueDeliveries as Mock).mockResolvedValue([
      makeDelivery({ id: "delivery-1", channel: "EMAIL" }),
      makeDelivery({ id: "delivery-2", channel: "EMAIL" }),
    ]);
    (getProvider as Mock).mockImplementation(async () => ({
      send: vi.fn().mockResolvedValue({ success: true, provider: "smtp", status: "SENT" }),
    }));

    await dispatchPendingDeliveries(ORG_ID);

    expect(getProvider).toHaveBeenCalledTimes(1);
  });

  it("resolves the provider separately per channel even within the same org/run", async () => {
    (findDueDeliveries as Mock).mockResolvedValue([
      makeDelivery({ id: "delivery-1", channel: "EMAIL" }),
      makeDelivery({ id: "delivery-2", channel: "WHATSAPP" }),
    ]);
    (getProvider as Mock).mockImplementation(async () => ({
      send: vi.fn().mockResolvedValue({ success: true, provider: "stub", status: "SENT" }),
    }));

    await dispatchPendingDeliveries(ORG_ID);

    expect(getProvider).toHaveBeenCalledTimes(2);
  });

  it("does not share the provider cache across two separate dispatch runs for the same org (test: cache scoped to one run)", async () => {
    (findDueDeliveries as Mock).mockResolvedValue([makeDelivery({ id: "delivery-1", channel: "EMAIL" })]);
    (getProvider as Mock).mockImplementation(async () => ({
      send: vi.fn().mockResolvedValue({ success: true, provider: "smtp", status: "SENT" }),
    }));

    await dispatchPendingDeliveries(ORG_ID);
    await dispatchPendingDeliveries(ORG_ID);

    expect(getProvider).toHaveBeenCalledTimes(2);
  });

  it("resolves the provider once per organization across two separate single-org runs (different orgs)", async () => {
    (getProvider as Mock).mockImplementation(async () => ({
      send: vi.fn().mockResolvedValue({ success: true, provider: "smtp", status: "SENT" }),
    }));

    (findDueDeliveries as Mock).mockResolvedValueOnce([makeDelivery({ id: "delivery-1", channel: "EMAIL" })]);
    await dispatchPendingDeliveries("org-a");

    (findDueDeliveries as Mock).mockResolvedValueOnce([makeDelivery({ id: "delivery-2", channel: "EMAIL" })]);
    await dispatchPendingDeliveries("org-b");

    expect(getProvider).toHaveBeenCalledTimes(2);
    expect(getProvider).toHaveBeenCalledWith("EMAIL", "org-a");
    expect(getProvider).toHaveBeenCalledWith("EMAIL", "org-b");
  });
});
