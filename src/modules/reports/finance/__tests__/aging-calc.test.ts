import { describe, it, expect } from "vitest";
import {
  calcDaysOverdue,
  calcAgingBucket,
  aggregateAgingBuckets,
  aggregatePaymentsKPIs,
} from "../utils/aging-calc";

// Fixed reference date: 2026-06-15
const TODAY = new Date("2026-06-15T12:00:00.000Z");

function daysAgo(n: number): Date {
  return new Date(TODAY.getTime() - n * 86_400_000);
}

function daysFromNow(n: number): Date {
  return new Date(TODAY.getTime() + n * 86_400_000);
}

// =============================================================================
// calcDaysOverdue
// =============================================================================

describe("calcDaysOverdue", () => {
  it("returns 0 for null dueDate", () => {
    expect(calcDaysOverdue(null, TODAY)).toBe(0);
  });

  it("returns 0 when dueDate is today", () => {
    expect(calcDaysOverdue(TODAY, TODAY)).toBe(0);
  });

  it("returns 0 when dueDate is in the future", () => {
    expect(calcDaysOverdue(daysFromNow(10), TODAY)).toBe(0);
  });

  it("returns correct days for exact past dates", () => {
    expect(calcDaysOverdue(daysAgo(1), TODAY)).toBe(1);
    expect(calcDaysOverdue(daysAgo(30), TODAY)).toBe(30);
    expect(calcDaysOverdue(daysAgo(60), TODAY)).toBe(60);
    expect(calcDaysOverdue(daysAgo(90), TODAY)).toBe(90);
    expect(calcDaysOverdue(daysAgo(91), TODAY)).toBe(91);
  });
});

// =============================================================================
// calcAgingBucket
// =============================================================================

describe("calcAgingBucket", () => {
  it("returns 'current' for null dueDate", () => {
    expect(calcAgingBucket(null, TODAY)).toBe("current");
  });

  it("returns 'current' when dueDate is today", () => {
    expect(calcAgingBucket(TODAY, TODAY)).toBe("current");
  });

  it("returns 'current' when dueDate is in the future", () => {
    expect(calcAgingBucket(daysFromNow(5), TODAY)).toBe("current");
    expect(calcAgingBucket(daysFromNow(365), TODAY)).toBe("current");
  });

  it("returns '1-30' for 1–30 days overdue", () => {
    expect(calcAgingBucket(daysAgo(1), TODAY)).toBe("1-30");
    expect(calcAgingBucket(daysAgo(15), TODAY)).toBe("1-30");
    expect(calcAgingBucket(daysAgo(30), TODAY)).toBe("1-30");
  });

  it("returns '31-60' for 31–60 days overdue", () => {
    expect(calcAgingBucket(daysAgo(31), TODAY)).toBe("31-60");
    expect(calcAgingBucket(daysAgo(45), TODAY)).toBe("31-60");
    expect(calcAgingBucket(daysAgo(60), TODAY)).toBe("31-60");
  });

  it("returns '61-90' for 61–90 days overdue", () => {
    expect(calcAgingBucket(daysAgo(61), TODAY)).toBe("61-90");
    expect(calcAgingBucket(daysAgo(75), TODAY)).toBe("61-90");
    expect(calcAgingBucket(daysAgo(90), TODAY)).toBe("61-90");
  });

  it("returns '90+' for more than 90 days overdue", () => {
    expect(calcAgingBucket(daysAgo(91), TODAY)).toBe("90+");
    expect(calcAgingBucket(daysAgo(180), TODAY)).toBe("90+");
    expect(calcAgingBucket(daysAgo(365), TODAY)).toBe("90+");
  });

  it("handles exact bucket boundaries correctly", () => {
    expect(calcAgingBucket(daysAgo(30), TODAY)).toBe("1-30");
    expect(calcAgingBucket(daysAgo(31), TODAY)).toBe("31-60");
    expect(calcAgingBucket(daysAgo(60), TODAY)).toBe("31-60");
    expect(calcAgingBucket(daysAgo(61), TODAY)).toBe("61-90");
    expect(calcAgingBucket(daysAgo(90), TODAY)).toBe("61-90");
    expect(calcAgingBucket(daysAgo(91), TODAY)).toBe("90+");
  });
});

// =============================================================================
// aggregateAgingBuckets
// =============================================================================

describe("aggregateAgingBuckets", () => {
  it("returns zero totals for empty input", () => {
    const { bucketMap, totalOutstanding } = aggregateAgingBuckets([], TODAY);
    expect(totalOutstanding).toBe(0);
    expect(bucketMap["current"].count).toBe(0);
    expect(bucketMap["90+"].total).toBe(0);
  });

  it("places rows into correct buckets", () => {
    const rows = [
      { balanceAmount: 1000, dueDate: daysFromNow(10) },  // current
      { balanceAmount: 500,  dueDate: daysAgo(15) },       // 1-30
      { balanceAmount: 750,  dueDate: daysAgo(45) },       // 31-60
      { balanceAmount: 200,  dueDate: daysAgo(75) },       // 61-90
      { balanceAmount: 300,  dueDate: daysAgo(120) },      // 90+
    ];

    const { bucketMap, totalOutstanding } = aggregateAgingBuckets(rows, TODAY);

    expect(bucketMap["current"].count).toBe(1);
    expect(bucketMap["current"].total).toBe(1000);
    expect(bucketMap["1-30"].count).toBe(1);
    expect(bucketMap["1-30"].total).toBe(500);
    expect(bucketMap["31-60"].total).toBe(750);
    expect(bucketMap["61-90"].total).toBe(200);
    expect(bucketMap["90+"].total).toBe(300);
    expect(totalOutstanding).toBe(2750);
  });

  it("accumulates multiple rows in the same bucket", () => {
    const rows = [
      { balanceAmount: 400, dueDate: daysAgo(5) },
      { balanceAmount: 600, dueDate: daysAgo(20) },
    ];

    const { bucketMap, totalOutstanding } = aggregateAgingBuckets(rows, TODAY);

    expect(bucketMap["1-30"].count).toBe(2);
    expect(bucketMap["1-30"].total).toBe(1000);
    expect(totalOutstanding).toBe(1000);
  });

  it("places null-dueDate rows in 'current'", () => {
    const rows = [
      { balanceAmount: 800, dueDate: null },
    ];

    const { bucketMap } = aggregateAgingBuckets(rows, TODAY);
    expect(bucketMap["current"].count).toBe(1);
    expect(bucketMap["current"].total).toBe(800);
  });
});

// =============================================================================
// aggregatePaymentsKPIs
// =============================================================================

describe("aggregatePaymentsKPIs", () => {
  const JAN = new Date("2026-01-15");
  const FEB = new Date("2026-02-15");

  it("returns zeros for empty payments", () => {
    const result = aggregatePaymentsKPIs([]);
    expect(result.totalReceived).toBe(0);
    expect(result.paymentsCount).toBe(0);
    expect(result.averagePayment).toBe(0);
    expect(result.netReceived).toBe(0);
  });

  it("calculates totals correctly", () => {
    const payments = [
      {
        totalAmount: 1000,
        paymentDate: JAN,
        splits: [{ method: "CASH", amount: 1000 }],
        refunds: [],
      },
      {
        totalAmount: 2000,
        paymentDate: FEB,
        splits: [{ method: "BANK_TRANSFER", amount: 2000 }],
        refunds: [{ amount: 500 }],
      },
    ];

    const result = aggregatePaymentsKPIs(payments);
    expect(result.totalReceived).toBe(3000);
    expect(result.paymentsCount).toBe(2);
    expect(result.averagePayment).toBe(1500);
    expect(result.refundedTotal).toBe(500);
    expect(result.netReceived).toBe(2500);
  });

  it("breaks down payment methods correctly", () => {
    const payments = [
      {
        totalAmount: 800,
        paymentDate: JAN,
        splits: [
          { method: "CASH", amount: 500 },
          { method: "MPESA", amount: 300 },
        ],
        refunds: [],
      },
    ];

    const result = aggregatePaymentsKPIs(payments);
    expect(result.cashReceived).toBe(500);
    expect(result.mobileMoneyReceived).toBe(300);
    expect(result.bankTransferReceived).toBe(0);
  });

  it("counts EMOLA in mobileMoneyReceived", () => {
    const payments = [
      {
        totalAmount: 600,
        paymentDate: JAN,
        splits: [{ method: "EMOLA", amount: 600 }],
        refunds: [],
      },
    ];

    const result = aggregatePaymentsKPIs(payments);
    expect(result.mobileMoneyReceived).toBe(600);
  });

  it("groups payments by month correctly", () => {
    const payments = [
      { totalAmount: 100, paymentDate: JAN, splits: [], refunds: [] },
      { totalAmount: 200, paymentDate: JAN, splits: [], refunds: [] },
      { totalAmount: 300, paymentDate: FEB, splits: [], refunds: [] },
    ];

    const result = aggregatePaymentsKPIs(payments);
    expect(result.monthMap.get("2026-01")?.total).toBe(300);
    expect(result.monthMap.get("2026-01")?.count).toBe(2);
    expect(result.monthMap.get("2026-02")?.total).toBe(300);
    expect(result.monthMap.get("2026-02")?.count).toBe(1);
  });

  it("sums multiple refunds per payment", () => {
    const payments = [
      {
        totalAmount: 1000,
        paymentDate: JAN,
        splits: [],
        refunds: [{ amount: 200 }, { amount: 150 }],
      },
    ];

    const result = aggregatePaymentsKPIs(payments);
    expect(result.refundedTotal).toBe(350);
    expect(result.netReceived).toBe(650);
  });
});
