import { describe, it, expect } from "vitest";
import { renderTemplate, extractTemplateVariables, validateTemplateVariables } from "../notification-template-renderer";

describe("renderTemplate — renders variables (test #1)", () => {
  it("substitutes every {{variable}} occurrence with its value", () => {
    const result = renderTemplate("O pagamento {{paymentNumber}} foi confirmado.", { paymentNumber: "PAY-001" });
    expect(result.rendered).toBe("O pagamento PAY-001 foi confirmado.");
    expect(result.missingVariables).toEqual([]);
  });

  it("renders both title and body templates the same way (test #4)", () => {
    const variables = { paymentNumber: "PAY-002" };
    const title = renderTemplate("Pagamento confirmado", variables);
    const body = renderTemplate("O pagamento {{paymentNumber}} foi confirmado.", variables);
    expect(title.rendered).toBe("Pagamento confirmado");
    expect(body.rendered).toBe("O pagamento PAY-002 foi confirmado.");
  });
});

describe("renderTemplate — handles missing variables (test #3)", () => {
  it("leaves a variable with no value literally as {{variableName}} and reports it as missing", () => {
    const result = renderTemplate("A justificação foi rejeitada. Motivo: {{rejectionReason}}", {});
    expect(result.rendered).toBe("A justificação foi rejeitada. Motivo: {{rejectionReason}}");
    expect(result.missingVariables).toEqual(["rejectionReason"]);
  });

  it("treats null the same as undefined — missing, not rendered as the literal string", () => {
    const result = renderTemplate("Olá {{name}}", { name: null });
    expect(result.rendered).toBe("Olá {{name}}");
    expect(result.missingVariables).toEqual(["name"]);
  });
});

describe("extractTemplateVariables", () => {
  it("returns unique variable names in order of first appearance", () => {
    expect(extractTemplateVariables("{{a}} e {{b}} e {{a}} outra vez")).toEqual(["a", "b"]);
  });
});

describe("validateTemplateVariables — rejects unknown variables (test #2)", () => {
  it("flags variables not in the allowed list", () => {
    const result = validateTemplateVariables("O valor é {{amount}}", ["paymentNumber"]);
    expect(result.valid).toBe(false);
    expect(result.unknownVariables).toEqual(["amount"]);
  });

  it("passes when every variable used is allowed", () => {
    const result = validateTemplateVariables("O pagamento {{paymentNumber}} foi confirmado.", [
      "paymentId",
      "paymentNumber",
    ]);
    expect(result.valid).toBe(true);
    expect(result.unknownVariables).toEqual([]);
  });
});
