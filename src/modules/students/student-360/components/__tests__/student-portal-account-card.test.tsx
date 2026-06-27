// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import type { StudentPortalAccountDto } from "@/modules/students/services/student-user-provisioning.service";

// ── Mocks ─────────────────────────────────────────────────────────────────────
const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mockRefresh }) }));

const { mockToastSuccess, mockToastError } = vi.hoisted(() => ({
  mockToastSuccess: vi.fn(),
  mockToastError: vi.fn(),
}));
vi.mock("@/shared/hooks/use-toast", () => ({
  toast: { success: mockToastSuccess, error: mockToastError },
  useToast: () => ({ toast: { success: mockToastSuccess, error: mockToastError } }),
}));

const { mockCreate, mockResend, mockUnlink } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockResend: vi.fn(),
  mockUnlink: vi.fn(),
}));
vi.mock("@/modules/students/actions/portal-account.actions", () => ({
  createOrLinkStudentPortalAccountAction: mockCreate,
  resendStudentPortalInviteAction: mockResend,
  unlinkStudentPortalAccountAction: mockUnlink,
}));

import { StudentPortalAccountCard } from "../student-portal-account-card";

const STUDENT = "student-1";

// ── Fixtures ──────────────────────────────────────────────────────────────────
function dto(over: Partial<StudentPortalAccountDto>): StudentPortalAccountDto {
  return {
    status: "not_linked",
    studentId: STUDENT,
    studentEmail: "aluno@test.pt",
    policy: {
      autoCreateStudentUserOnActivation: true,
      sendStudentPortalInvite: true,
      studentPortalInviteStrategy: "INVITE_LINK",
    },
    ...over,
  };
}

const linkedUser = {
  id: "u1",
  name: "Ana Silva",
  email: "ana@test.pt",
  status: "ACTIVE" as const,
  lastLoginAt: null,
};

// Convenience: the three mutation buttons by their visible label.
const createBtn = () => screen.queryByRole("button", { name: /Criar conta do portal/i });
const resendBtn = () => screen.queryByRole("button", { name: /Reenviar convite/i });
const unlinkBtn = () => screen.queryByRole("button", { name: /Desvincular conta/i });

beforeEach(() => {
  vi.clearAllMocks();
  mockCreate.mockResolvedValue({ success: true, data: { inviteUrl: "/set-password?token=tok123" } });
  mockResend.mockResolvedValue({ success: true, data: { inviteUrl: "/set-password?token=tok456" } });
  mockUnlink.mockResolvedValue({ success: true });
});
afterEach(() => cleanup());

// ── Status: missing_email ─────────────────────────────────────────────────────
describe("missing_email", () => {
  it("shows the no-email warning and offers no mutation buttons", () => {
    render(<StudentPortalAccountCard account={dto({ status: "missing_email", studentEmail: null })} canManage />);
    expect(screen.getByText(/não possui email/i)).toBeTruthy();
    expect(createBtn()).toBeNull();
    expect(resendBtn()).toBeNull();
    expect(unlinkBtn()).toBeNull();
  });
});

// ── Status: not_linked ────────────────────────────────────────────────────────
describe("not_linked", () => {
  it("shows 'Criar conta do portal' when canManage=true", () => {
    render(<StudentPortalAccountCard account={dto({ status: "not_linked" })} canManage />);
    expect(createBtn()).not.toBeNull();
    expect(resendBtn()).toBeNull();
    expect(unlinkBtn()).toBeNull();
  });

  it("shows no button when canManage=false", () => {
    render(<StudentPortalAccountCard account={dto({ status: "not_linked" })} canManage={false} />);
    expect(createBtn()).toBeNull();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});

// ── Status: linked (active account) ───────────────────────────────────────────
describe("linked", () => {
  it("shows linked user details and the unlink button (manager mode)", () => {
    render(<StudentPortalAccountCard account={dto({ status: "linked", linkedUser })} canManage />);
    expect(screen.getByText("Ana Silva")).toBeTruthy();
    expect(screen.getByText("ana@test.pt")).toBeTruthy();
    expect(screen.getByText("Ativa")).toBeTruthy(); // estado da conta
    expect(unlinkBtn()).not.toBeNull();
    // Resend is intentionally hidden for an already-active account (it would be a no-op).
    expect(resendBtn()).toBeNull();
  });

  it("hides the unlink button when not in manager mode (canManage=false)", () => {
    render(<StudentPortalAccountCard account={dto({ status: "linked", linkedUser })} canManage={false} />);
    // Details still visible…
    expect(screen.getByText("Ana Silva")).toBeTruthy();
    // …but no mutation buttons.
    expect(unlinkBtn()).toBeNull();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});

// ── Status: invite_pending ────────────────────────────────────────────────────
describe("invite_pending", () => {
  const invite = {
    sentAt: new Date("2026-06-20T12:00:00Z"),
    expiresAt: new Date("2026-07-01T12:00:00Z"),
    status: "active" as const,
  };

  it("shows the invite expiry and the resend button when canManage=true", () => {
    render(
      <StudentPortalAccountCard account={dto({ status: "invite_pending", linkedUser, invite })} canManage />
    );
    expect(screen.getByText(/Convite expira em/i)).toBeTruthy();
    expect(screen.getByText("Ativo")).toBeTruthy(); // estado do convite
    expect(resendBtn()).not.toBeNull();
    expect(unlinkBtn()).not.toBeNull();
  });

  it("hides resend when canManage=false", () => {
    render(
      <StudentPortalAccountCard account={dto({ status: "invite_pending", linkedUser, invite })} canManage={false} />
    );
    expect(screen.getByText(/Convite expira em/i)).toBeTruthy();
    expect(resendBtn()).toBeNull();
  });
});

// ── Status: invite_expired ────────────────────────────────────────────────────
describe("invite_expired", () => {
  const invite = {
    sentAt: new Date("2026-05-20T12:00:00Z"),
    expiresAt: new Date("2026-06-01T12:00:00Z"),
    status: "expired" as const,
  };

  it("shows the expired state and the resend button when canManage=true", () => {
    render(
      <StudentPortalAccountCard account={dto({ status: "invite_expired", linkedUser, invite })} canManage />
    );
    expect(screen.getByText("Expirado")).toBeTruthy();
    expect(resendBtn()).not.toBeNull();
  });
});

// ── Status: email_conflict ────────────────────────────────────────────────────
describe("email_conflict", () => {
  it("shows the conflict warning and NO automatic link/create button", () => {
    render(<StudentPortalAccountCard account={dto({ status: "email_conflict" })} canManage />);
    expect(screen.getByText(/já está associado a outro/i)).toBeTruthy();
    // No unsafe automatic linking — the admin must resolve it manually.
    expect(createBtn()).toBeNull();
    expect(resendBtn()).toBeNull();
    expect(unlinkBtn()).toBeNull();
  });
});

// ── Status: disabled_by_policy ────────────────────────────────────────────────
describe("disabled_by_policy", () => {
  it("shows the policy message and a manual create button only when canManage=true", () => {
    render(
      <StudentPortalAccountCard
        account={dto({
          status: "disabled_by_policy",
          policy: {
            autoCreateStudentUserOnActivation: false,
            sendStudentPortalInvite: true,
            studentPortalInviteStrategy: "INVITE_LINK",
          },
        })}
        canManage
      />
    );
    expect(screen.getByText(/criação automática de contas está desativada/i)).toBeTruthy();
    expect(createBtn()).not.toBeNull();
  });

  it("hides the manual create button when canManage=false", () => {
    render(
      <StudentPortalAccountCard
        account={dto({ status: "disabled_by_policy" })}
        canManage={false}
      />
    );
    expect(screen.getByText(/criação automática de contas está desativada/i)).toBeTruthy();
    expect(createBtn()).toBeNull();
  });
});

// ── Invite-URL one-time reveal ────────────────────────────────────────────────
describe("one-time invite URL", () => {
  it("does NOT render an invite URL before any successful action", () => {
    render(<StudentPortalAccountCard account={dto({ status: "not_linked" })} canManage />);
    expect(screen.queryByText(/mostrado apenas uma vez/i)).toBeNull();
    expect(screen.queryByText("/set-password?token=tok123")).toBeNull();
  });

  it("reveals the one-time invite URL after a successful create", async () => {
    render(<StudentPortalAccountCard account={dto({ status: "not_linked" })} canManage />);
    fireEvent.click(createBtn()!);

    await waitFor(() => expect(mockCreate).toHaveBeenCalledWith(STUDENT));
    await waitFor(() => expect(screen.getByText(/mostrado apenas uma vez/i)).toBeTruthy());
    expect(screen.getByText("/set-password?token=tok123")).toBeTruthy();
    expect(mockToastSuccess).toHaveBeenCalled();
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("does not reveal a URL when the action fails", async () => {
    mockCreate.mockResolvedValue({ success: false, error: "Falhou" });
    render(<StudentPortalAccountCard account={dto({ status: "not_linked" })} canManage />);
    fireEvent.click(createBtn()!);

    await waitFor(() => expect(mockToastError).toHaveBeenCalled());
    expect(screen.queryByText(/mostrado apenas uma vez/i)).toBeNull();
  });
});

// ── Secrets must never reach the DOM ──────────────────────────────────────────
describe("no secrets rendered", () => {
  it("renders no password/hash/token for a linked account", () => {
    const { container } = render(
      <StudentPortalAccountCard account={dto({ status: "linked", linkedUser })} canManage />
    );
    const html = container.innerHTML;
    expect(html).not.toMatch(/passwordHash/i);
    expect(html).not.toMatch(/\bhash\b/i);
    // No bare token query strings are surfaced for an established account.
    expect(html).not.toMatch(/token=/i);
  });

  it("the revealed invite link is a set-password URL only — never a credential", async () => {
    render(<StudentPortalAccountCard account={dto({ status: "not_linked" })} canManage />);
    fireEvent.click(createBtn()!);
    await waitFor(() => expect(screen.getByText(/mostrado apenas uma vez/i)).toBeTruthy());
    const region = screen.getByText(/mostrado apenas uma vez/i).closest("div")!;
    const text = within(region).getByText(/\/set-password/).textContent ?? "";
    expect(text).toContain("/set-password");
    expect(text).not.toMatch(/palavra-passe\s*:/i); // no inline plaintext password
  });
});
