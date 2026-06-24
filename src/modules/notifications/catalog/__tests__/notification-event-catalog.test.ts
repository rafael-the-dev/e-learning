import { describe, it, expect } from "vitest";
import { listEventCatalog, defaultPriorityForSeverity } from "../notification-event-catalog";
import { validateTemplateVariables } from "@/modules/notifications/services/notification-template-renderer";

describe("notification event catalog — seeded templates use allowed variables (test #21)", () => {
  it.each(listEventCatalog())("$eventType: title/body/actionUrl only reference declared variables", (event) => {
    const titleCheck = validateTemplateVariables(event.defaultTitleTemplate, event.variables);
    const bodyCheck = validateTemplateVariables(event.defaultBodyTemplate, event.variables);
    expect(titleCheck.unknownVariables).toEqual([]);
    expect(bodyCheck.unknownVariables).toEqual([]);

    if (event.defaultActionUrlPattern) {
      const urlCheck = validateTemplateVariables(event.defaultActionUrlPattern, event.variables);
      expect(urlCheck.unknownVariables).toEqual([]);
    }
  });
});

describe("notification event catalog — every event type has defaults (test #22)", () => {
  it.each(listEventCatalog())("$eventType: has a non-empty label/title/body/severity", (event) => {
    expect(event.label.length).toBeGreaterThan(0);
    expect(event.defaultTitleTemplate.length).toBeGreaterThan(0);
    expect(event.defaultBodyTemplate.length).toBeGreaterThan(0);
    expect(["INFO", "SUCCESS", "WARNING", "CRITICAL"]).toContain(event.defaultSeverity);
    expect(event.supportedChannels.length).toBeGreaterThan(0);
  });

  it.each(listEventCatalog())("$eventType: sampleVariables covers every declared variable", (event) => {
    for (const variable of event.variables) {
      expect(event.sampleVariables).toHaveProperty(variable);
    }
  });

  it("includes the 4 Phase 2 primary events and the 5 catalogued legacy events", () => {
    const eventTypes = listEventCatalog().map((e) => e.eventType);
    expect(eventTypes).toEqual(
      expect.arrayContaining([
        "payment.confirmed",
        "invoice.overdue",
        "assessment.results_published",
        "attendance.student_at_risk",
        "enrollment.created",
        "enrollment.activated",
        "attendance.justification_approved",
        "attendance.justification_rejected",
        "lesson.published",
      ])
    );
  });
});

describe("defaultPriorityForSeverity", () => {
  it("maps CRITICAL severity to CRITICAL priority", () => {
    expect(defaultPriorityForSeverity("CRITICAL")).toBe("CRITICAL");
  });

  it("maps WARNING severity to HIGH priority", () => {
    expect(defaultPriorityForSeverity("WARNING")).toBe("HIGH");
  });

  it("maps INFO/SUCCESS severity to NORMAL priority", () => {
    expect(defaultPriorityForSeverity("INFO")).toBe("NORMAL");
    expect(defaultPriorityForSeverity("SUCCESS")).toBe("NORMAL");
  });
});
