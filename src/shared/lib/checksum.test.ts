import { describe, it, expect } from "vitest";
import { canonicalize, contentChecksum } from "@/shared/lib/checksum";

// A tiny Decimal-like stand-in mirroring Prisma.Decimal's surface: a numeric
// `toString`/`toFixed`. The checksum must normalize it by numeric value so that
// "1.50" and "1.5" hash identically.
class DecimalLike {
  constructor(private readonly raw: string) {}
  toString() {
    return this.raw;
  }
  toFixed(digits: number) {
    return Number(this.raw).toFixed(digits);
  }
}

describe("contentChecksum — content-only SHA-256", () => {
  it("1. is stable: same input yields the same checksum across calls", () => {
    const payload = { a: 1, b: "x", c: [1, 2, 3] };
    const first = contentChecksum(payload);
    const second = contentChecksum(payload);
    expect(first).toEqual(second);
    // lowercase hex SHA-256 → 64 hex chars
    expect(first).toMatch(/^[0-9a-f]{64}$/);
  });

  it("2. key order is irrelevant: differently-ordered objects hash the same", () => {
    const a = { alpha: 1, beta: 2, gamma: 3 };
    const b = { gamma: 3, alpha: 1, beta: 2 };
    expect(contentChecksum(a)).toEqual(contentChecksum(b));
  });

  it("3. is value-sensitive: changing any field changes the checksum", () => {
    const base = { name: "Ana", grade: 14, passed: true };
    expect(contentChecksum({ ...base, grade: 15 })).not.toEqual(contentChecksum(base));
    expect(contentChecksum({ ...base, name: "',bel" })).not.toEqual(contentChecksum(base));
    expect(contentChecksum({ ...base, passed: false })).not.toEqual(contentChecksum(base));
  });

  it("4. array order is significant: reordering an array changes the checksum", () => {
    expect(contentChecksum({ subjects: [1, 2, 3] })).not.toEqual(
      contentChecksum({ subjects: [3, 2, 1] })
    );
  });

  it("5. number/decimal normalization: 1.50, 1.5, '1.5'-Decimal collapse", () => {
    // Rule: numbers are normalized via Number → String(Number(x)); Decimal-like
    // objects route through their numeric toString then the same normalization.
    const asFloat = contentChecksum({ credits: 1.5 });
    const asTrailingZeroLiteral = contentChecksum({ credits: 1.5 }); // 1.50 === 1.5 in JS
    const asDecimal = contentChecksum({ credits: new DecimalLike("1.50") });
    const asDecimalPlain = contentChecksum({ credits: new DecimalLike("1.5") });
    expect(asFloat).toEqual(asTrailingZeroLiteral);
    expect(asDecimal).toEqual(asFloat);
    expect(asDecimalPlain).toEqual(asFloat);

    // 1.0 and 1 collapse; a genuinely different value does not.
    expect(contentChecksum({ credits: 1.0 })).toEqual(contentChecksum({ credits: 1 }));
    expect(contentChecksum({ credits: new DecimalLike("2.0") })).not.toEqual(asFloat);

    // canonical form assertions (documenting the rule directly)
    expect(canonicalize(1.5)).toBe("1.5");
    expect(canonicalize(new DecimalLike("1.50"))).toBe("1.5");
    expect(canonicalize(1.0)).toBe("1");
  });

  it("6. nested-object determinism: deeply nested key order is irrelevant", () => {
    const a = {
      student: { id: "s1", name: "Rui" },
      level: { code: "L1", subjects: [{ id: "x", grade: 10 }] },
    };
    const b = {
      level: { subjects: [{ grade: 10, id: "x" }], code: "L1" },
      student: { name: "Rui", id: "s1" },
    };
    expect(contentChecksum(a)).toEqual(contentChecksum(b));
    expect(canonicalize(a)).toEqual(canonicalize(b));
  });

  it("7. undefined-valued keys are omitted; explicit null differs", () => {
    // A key with value undefined is treated as absent...
    expect(contentChecksum({ a: 1, b: undefined })).toEqual(contentChecksum({ a: 1 }));
    // ...but an explicit null is serialized and therefore differs from absent.
    expect(contentChecksum({ a: 1, b: null })).not.toEqual(contentChecksum({ a: 1 }));
    expect(contentChecksum({ a: 1, b: null })).not.toEqual(
      contentChecksum({ a: 1, b: undefined })
    );
    // canonical form documents the omission vs explicit null
    expect(canonicalize({ a: 1, b: undefined })).toBe('{"a":1}');
    expect(canonicalize({ a: 1, b: null })).toBe('{"a":1,"b":null}');
  });

  it("Date serializes as ISO-8601 and is stable", () => {
    const d1 = new Date("2026-07-06T10:00:00.000Z");
    const d2 = new Date("2026-07-06T10:00:00.000Z");
    expect(canonicalize(d1)).toBe('"2026-07-06T10:00:00.000Z"');
    expect(contentChecksum({ issuedAt: d1 })).toEqual(contentChecksum({ issuedAt: d2 }));
  });
});
