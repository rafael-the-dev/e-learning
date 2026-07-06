import { beforeEach, describe, expect, it } from "vitest";
import { asClient, makeFakeDb, type FakeDb } from "./_fake-db";
import {
  createTranscriptRequest,
  findTranscriptRequestById,
  listTranscriptRequests,
  updateTranscriptRequestStatus,
} from "../academic-transcript-request.repository";

const ORG_A = "org-A";
const ORG_B = "org-B";

let db: FakeDb;

beforeEach(() => {
  db = makeFakeDb();
});

describe("academic-transcript-request.repository — org-scoped (test #7)", () => {
  it("createTranscriptRequest defaults status to PENDING", async () => {
    const req = await createTranscriptRequest(
      { organizationId: ORG_A, studentId: "s-1", requestedBy: "user-1", requestType: "COURSE_TRANSCRIPT" },
      asClient(db)
    );
    expect(req.status).toBe("PENDING");
    expect(req.requestType).toBe("COURSE_TRANSCRIPT");
  });

  it("findTranscriptRequestById does not return another org's request", async () => {
    const req = await createTranscriptRequest(
      { organizationId: ORG_A, studentId: "s-1", requestedBy: "user-1", requestType: "COURSE_TRANSCRIPT" },
      asClient(db)
    );
    await expect(findTranscriptRequestById({ id: req.id, organizationId: ORG_A }, asClient(db))).resolves.toMatchObject({ id: req.id });
    await expect(findTranscriptRequestById({ id: req.id, organizationId: ORG_B }, asClient(db))).resolves.toBeNull();
  });

  it("listTranscriptRequests filters by org + status and paginates", async () => {
    await createTranscriptRequest({ organizationId: ORG_A, studentId: "s-1", requestedBy: "u", requestType: "COURSE_TRANSCRIPT", status: "PENDING" }, asClient(db));
    await createTranscriptRequest({ organizationId: ORG_A, studentId: "s-1", requestedBy: "u", requestType: "COURSE_TRANSCRIPT", status: "APPROVED" }, asClient(db));
    await createTranscriptRequest({ organizationId: ORG_B, studentId: "s-1", requestedBy: "u", requestType: "COURSE_TRANSCRIPT", status: "PENDING" }, asClient(db));

    const pending = await listTranscriptRequests({ organizationId: ORG_A, status: "PENDING", page: 1, pageSize: 10 }, asClient(db));
    expect(pending.total).toBe(1);
    expect(pending.data[0].organizationId).toBe(ORG_A);

    const all = await listTranscriptRequests({ organizationId: ORG_A, page: 1, pageSize: 10 }, asClient(db));
    expect(all.total).toBe(2); // ORG_B excluded
  });

  it("updateTranscriptRequestStatus writes verbatim status, scoped by org (no workflow rules)", async () => {
    const req = await createTranscriptRequest(
      { organizationId: ORG_A, studentId: "s-1", requestedBy: "user-1", requestType: "COURSE_TRANSCRIPT" },
      asClient(db)
    );

    const wrong = await updateTranscriptRequestStatus({ id: req.id, organizationId: ORG_B, status: "APPROVED" }, asClient(db));
    expect(wrong.count).toBe(0);

    // proves NO workflow guard: PENDING → FULFILLED written directly
    const ok = await updateTranscriptRequestStatus(
      { id: req.id, organizationId: ORG_A, status: "FULFILLED", fulfilledTranscriptVersionId: "v-9", reviewedBy: "user-2" },
      asClient(db)
    );
    expect(ok.count).toBe(1);
    const after = await findTranscriptRequestById({ id: req.id, organizationId: ORG_A }, asClient(db));
    expect(after).toMatchObject({ status: "FULFILLED", fulfilledTranscriptVersionId: "v-9", reviewedBy: "user-2" });
  });
});
