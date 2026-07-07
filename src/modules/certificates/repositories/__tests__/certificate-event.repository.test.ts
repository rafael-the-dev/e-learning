import { describe, expect, it } from "vitest";
import { asClient, makeFakeDb, seed } from "./_fake-db";
import * as eventRepo from "../certificate-event.repository";
import {
  createCertificateEvent,
  findCertificateEventById,
  listCertificateEvents,
} from "../certificate-event.repository";

const ORG = "org-A";
const OTHER = "org-B";

describe("certificate-event repository (append-only)", () => {
  it("23. appends an event", async () => {
    const db = makeFakeDb();
    const rec = await createCertificateEvent(
      { organizationId: ORG, certificateId: "c1", eventType: "certificate.issued", newStatus: "ISSUED", actorId: "user-1" },
      asClient(db)
    );
    expect(rec.eventType).toBe("certificate.issued");
    expect(rec.newStatus).toBe("ISSUED");
    expect(await findCertificateEventById({ id: rec.id, organizationId: ORG }, asClient(db))).not.toBeNull();
  });

  it("24. lists events ordered by createdAt asc, org-scoped", async () => {
    const db = makeFakeDb();
    seed(db, "certificateEvent", { id: "e2", organizationId: ORG, certificateId: "c1", eventType: "certificate.issued", createdAt: new Date("2026-07-02T00:00:00.000Z") });
    seed(db, "certificateEvent", { id: "e1", organizationId: ORG, certificateId: "c1", eventType: "certificate.generated", createdAt: new Date("2026-07-01T00:00:00.000Z") });
    seed(db, "certificateEvent", { id: "e-other", organizationId: OTHER, certificateId: "c1", eventType: "certificate.issued", createdAt: new Date("2026-07-01T00:00:00.000Z") });

    const events = await listCertificateEvents({ organizationId: ORG, certificateId: "c1" }, asClient(db));
    expect(events.map((e) => e.id)).toEqual(["e1", "e2"]);
  });

  it("25. exposes no update/delete method at the module surface", () => {
    const fns = Object.keys(eventRepo).filter((k) => typeof (eventRepo as Record<string, unknown>)[k] === "function");
    for (const name of fns) {
      expect(name).not.toMatch(/update|delete|upsert|remove|destroy/i);
    }
  });
});
