// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";

// The card + AllowedActionButton are client components: stub next/navigation and
// the toast hook so they render in isolation. `fetch` is stubbed per-test.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/shared/hooks/use-toast", () => ({ toast: vi.fn() }));

import { PublicationReadinessCard } from "../publication-readiness-card";
import type { ExamPublicationReadinessDto } from "@/modules/examinations/types/portal";

const SESSION_ID = "sess-1";
const PUBLISH_URL = `/api/examinations/sessions/${SESSION_ID}/publish`;

function makeReadiness(): ExamPublicationReadinessDto {
  return {
    examSessionId: SESSION_ID,
    sessionStatus: "COMPLETED",
    requiredCandidateCount: 3,
    resultCount: 3,
    missingCandidateIds: [],
    nonApprovedResultIds: [],
    staleResultIds: [],
    activePublicationId: null,
    publicationStatus: null,
    downstreamConsumed: false,
    ready: true,
    blockers: [],
    allowedActions: { canPublish: true, canRetract: false },
  };
}

let fetchMock: ReturnType<typeof vi.fn>;

function publishCallCount(): number {
  return fetchMock.mock.calls.filter((c) => String(c[0]) === PUBLISH_URL).length;
}

beforeEach(() => {
  fetchMock = vi.fn((url: string) => {
    // Publish POST and the mount readiness refetch both resolve OK.
    const body = String(url) === PUBLISH_URL ? {} : makeReadiness();
    return Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as Response);
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("PublicationReadinessCard — Publicar requires confirmation (H1)", () => {
  it("does NOT call the publish endpoint on the first click — it opens a confirmation dialog", async () => {
    render(<PublicationReadinessCard readiness={makeReadiness()} />);
    // Let the mount refetch settle so its fetch isn't confused with the publish call.
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const trigger = screen.getByRole("button", { name: "Publicar resultados" });
    fireEvent.click(trigger);

    // The confirmation dialog appears with the exact spec copy…
    await screen.findByText("Publicar resultados?");
    expect(
      screen.getByText(/ficarão visíveis para os candidatos/i),
    ).toBeTruthy();

    // …and crucially, publishing has NOT happened yet.
    expect(publishCallCount()).toBe(0);
  });

  it("calls the publish endpoint only after the user confirms in the dialog", async () => {
    render(<PublicationReadinessCard readiness={makeReadiness()} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "Publicar resultados" }));

    const dialog = await screen.findByRole("alertdialog");
    // Confirm button lives inside the dialog (same label as the trigger).
    const confirmButton = within(dialog).getByRole("button", { name: "Publicar resultados" });
    fireEvent.click(confirmButton);

    await waitFor(() => expect(publishCallCount()).toBe(1));
    const publishCall = fetchMock.mock.calls.find((c) => String(c[0]) === PUBLISH_URL)!;
    expect(publishCall[1]?.method).toBe("POST");
  });

  it("offers Cancelar, which dismisses the dialog without publishing", async () => {
    render(<PublicationReadinessCard readiness={makeReadiness()} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "Publicar resultados" }));
    const dialog = await screen.findByRole("alertdialog");

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(publishCallCount()).toBe(0);
  });
});
