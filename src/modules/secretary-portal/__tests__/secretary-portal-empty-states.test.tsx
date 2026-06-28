// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

// The notifications panel is a client component that pulls in next/navigation
// and the notification server actions — stub both so it renders in isolation.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/modules/notifications/actions/notification.actions", () => ({
  markNotificationReadAction: vi.fn(),
  archiveNotificationAction: vi.fn(),
}));

import { SecretaryOperationalQueues } from "../components/secretary-operational-queues";
import { SecretaryStudentAdministration } from "../components/secretary-student-administration";
import { SecretaryNotificationsPanel } from "../components/secretary-notifications-panel";
import { SecretaryFinancialAttention } from "../components/secretary-financial-attention";
import { SecretaryUpcomingDeadlines } from "../components/secretary-upcoming-deadlines";

afterEach(() => cleanup());

describe("Secretary Portal — empty states (23)", () => {
  it("operational queues render an empty state when there are no rows", () => {
    render(
      <SecretaryOperationalQueues
        queues={{ pendingEnrollments: [], attentionInvoices: [], documentsToReview: [], recentStudents: [] }}
      />
    );
    // Default tab is "Matrículas".
    expect(screen.getByText("Sem matrículas pendentes.")).toBeTruthy();
  });

  it("student administration renders an all-clear empty state when there are no issues", () => {
    render(
      <SecretaryStudentAdministration
        administration={{
          withoutPortalAccount: 0,
          missingEmail: 0,
          inactiveWithActiveEnrollment: 0,
          enrollmentWithoutClassGroup: 0,
          enrollmentWithoutLevel: 0,
          studentsWithoutPortalAccount: [],
        }}
      />
    );
    expect(screen.getByText("Sem irregularidades de dados.")).toBeTruthy();
  });

  it("notifications panel renders an empty state when there are no notifications", () => {
    render(<SecretaryNotificationsPanel notifications={[]} />);
    expect(screen.getByText("Sem notificações novas.")).toBeTruthy();
  });

  it("upcoming deadlines render an empty state when nothing is due", () => {
    render(<SecretaryUpcomingDeadlines deadlines={[]} />);
    expect(screen.getByText("Sem prazos próximos")).toBeTruthy();
  });

  it("financial attention still renders its triage rows at zero (operational panel, no empty state)", () => {
    render(
      <SecretaryFinancialAttention
        attention={{
          overdueInvoiceCount: 0,
          overdueAmount: 0,
          pendingPaymentCount: 0,
          pendingPaymentAmount: 0,
          pendingRefundCount: 0,
          pendingRefundAmount: 0,
        }}
      />
    );
    expect(screen.getByText("Facturas Vencidas")).toBeTruthy();
    expect(screen.getByText("Pagamentos a Confirmar")).toBeTruthy();
    expect(screen.getByText("Reembolsos Pendentes")).toBeTruthy();
    // Counts shown as "0 registo(s)" — there is no row loading, just zeros.
    expect(screen.getAllByText("0 registo(s)").length).toBe(3);
  });
});
