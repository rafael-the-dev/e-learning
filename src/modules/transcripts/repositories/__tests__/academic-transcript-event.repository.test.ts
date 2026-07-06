import { beforeEach, describe, expect, it } from "vitest";
import { asClient, makeFakeDb, type FakeDb } from "./_fake-db";
import * as eventRepo from "../academic-transcript-event.repository";
import {
  createTranscriptEvent,
  findTranscriptEventById,
  listTranscriptEvents,
} from "../academic-transcript-event.repository";

const ORG_A = "org-A";
const ORG_B = "org-B";
const T1 = "transcript-1";

let db: FakeDb;

beforeEach(() => {
  db = makeFakeDb();
});

describe("academic-transcript-event.repository — append-only, org-scoped (test #5)", () => {
  it("createTranscriptEvent + findTranscriptEventById are org-scoped", async () => {
    const ev = await createTranscriptEvent(
      { organizationId: ORG_A, transcriptId: T1, eventType: "transcript.issued", actorId: "user-1" },
      asClient(db)
    );
    await expect(
      findTranscriptEventById({ id: ev.id, organizationId: ORG_A }, asClient(db))
    ).resolves.toMatchObject({ id: ev.id, eventType: "transcript.issued" });
    await expect(
      findTranscriptEventById({ id: ev.id, organizationId: ORG_B }, asClient(db))
    ).resolves.toBeNull();
  });

  it("listTranscriptEvents filters by transcript + optional version/type, org-scoped, ordered asc", async () => {
    await createTranscriptEvent({ organizationId: ORG_A, transcriptId: T1, eventType: "transcript.generated" }, asClient(db));
    await createTranscriptEvent(
      { organizationId: ORG_A, transcriptId: T1, eventType: "transcript.issued", transcriptVersionId: "v-1" },
      asClient(db)
    );
    await createTranscriptEvent({ organizationId: ORG_B, transcriptId: T1, eventType: "transcript.issued" }, asClient(db));

    const all = await listTranscriptEvents({ organizationId: ORG_A, transcriptId: T1 }, asClient(db));
    expect(all).toHaveLength(2); // ORG_B excluded

    const byVersion = await listTranscriptEvents(
      { organizationId: ORG_A, transcriptId: T1, transcriptVersionId: "v-1" },
      asClient(db)
    );
    expect(byVersion).toHaveLength(1);
    expect(byVersion[0].transcriptVersionId).toBe("v-1");

    const byType = await listTranscriptEvents(
      { organizationId: ORG_A, transcriptId: T1, eventType: "transcript.generated" },
      asClient(db)
    );
    expect(byType).toHaveLength(1);
  });

  it("exposes create/read only — no update/delete/upsert methods (append-only)", () => {
    const fns = Object.keys(eventRepo).filter(
      (k) => typeof (eventRepo as Record<string, unknown>)[k] === "function"
    );
    for (const name of fns) {
      expect(name).not.toMatch(/update|delete|upsert/i);
    }
  });
});
