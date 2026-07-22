import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve, join, sep } from "node:path";
import { DomainEventType } from "../event-types";
import { STUDENT_RISK_RECALCULATION_EVENTS } from "../handlers/student-risk-projection.handler";

// =============================================================================
// M12 — Mutation Audit (Story 7). The risk projection is only as fresh as the
// events that trigger its recompute. Every event the handler SUBSCRIBES to must be
// actually PUBLISHED somewhere — otherwise a mutation silently never updates risk.
//
// This guard fails CI if a subscribed risk trigger has no publisher (a dead
// subscription): e.g. the handler lists STUDENT_DOCUMENT_STATUS_CHANGED but no
// command emits it, so document changes would never refresh the projection.
//
// A "publisher" is a module that (a) references DomainEventType.<KEY> and (b) actually emits
// (emitOrCollect / *.publish / publishDomainEvent / collectEvent). This recognizes BOTH the
// direct shape `eventType: DomainEventType.X` and the computed-variable shape
// (`const eventType = cond ? DomainEventType.A : DomainEventType.B; ... emitOrCollect({ eventType })`).
// Event *handler* files are excluded — they are subscription sites, so a subscription can never
// satisfy its own publisher requirement. (Every risk trigger is emitted by a command/service/
// engine/job, never solely from a handler.)
// =============================================================================

const SRC = resolve(process.cwd(), "src");
const HANDLERS_DIR = join("server", "events", "handlers") + sep;
const EVENT_TYPES_FILE = join("server", "events", "event-types.ts");
const EMIT_CALL = /emitOrCollect\(|\.publish\(|publishDomainEvent\(|collectEvent\(/;

function collectSourceFiles(): string[] {
  return readdirSync(SRC, { recursive: true, encoding: "utf8" })
    .filter(
      (f) =>
        (f.endsWith(".ts") || f.endsWith(".tsx")) &&
        !f.includes("__tests__") &&
        !f.endsWith(".test.ts") &&
        !f.endsWith(".test.tsx")
    )
    .filter((f) => !f.includes(HANDLERS_DIR) && !f.endsWith(EVENT_TYPES_FILE))
    .map((f) => join(SRC, f));
}

// value ("enrollment.created") → KEY ("ENROLLMENT_CREATED")
const VALUE_TO_KEY = new Map<string, string>(
  Object.entries(DomainEventType).map(([k, v]) => [v as string, k])
);

// Only files that actually emit — a subscription-only reference cannot count as a publisher.
const EMITTING_SOURCES = collectSourceFiles()
  .map((f) => readFileSync(f, "utf8"))
  .filter((src) => EMIT_CALL.test(src));

function hasPublisher(eventKey: string): boolean {
  const re = new RegExp(`DomainEventType\\.${eventKey}\\b`);
  return EMITTING_SOURCES.some((src) => re.test(src));
}

describe("M12 mutation audit — every risk-subscribed event has a publisher", () => {
  it.each(STUDENT_RISK_RECALCULATION_EVENTS)("event %s is emitted by at least one command/job", (eventValue) => {
    const key = VALUE_TO_KEY.get(eventValue);
    expect(key, `no DomainEventType key for value "${eventValue}"`).toBeDefined();
    expect(
      hasPublisher(key!),
      `Risk handler subscribes to ${key} but nothing publishes "eventType: DomainEventType.${key}". ` +
        `A mutation that should refresh the risk projection is missing its event.`
    ).toBe(true);
  });

  it("the subscription list has no duplicates (each trigger declared once)", () => {
    const set = new Set(STUDENT_RISK_RECALCULATION_EVENTS);
    expect(set.size).toBe(STUDENT_RISK_RECALCULATION_EVENTS.length);
  });
});
