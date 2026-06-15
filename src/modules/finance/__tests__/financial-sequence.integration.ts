/**
 * Financial Sequence — Integration Test Script
 * =============================================
 * Proves that SQL Server SEQUENCE objects prevent duplicate number generation
 * under 100 concurrent record creations for invoices, payments, and receipts.
 *
 * Prerequisites
 * -------------
 * 1. Set DATABASE_URL to a live SQL Server connection string.
 * 2. Run `prisma migrate deploy` so InvoiceSequence/PaymentSequence/ReceiptSequence exist.
 * 3. Set TEST_ORG_ID to an existing Organisation.id.
 * 4. Set TEST_STUDENT_ID to an existing Student.id in that organisation.
 *
 * Run
 * ---
 *   npx tsx src/modules/finance/__tests__/financial-sequence.integration.ts
 *
 * What it tests
 * -------------
 * Scenario A — 100 concurrent invoice creations: all numbers must be unique.
 * Scenario B — 100 concurrent payment creations: all numbers must be unique.
 * Scenario C — 100 concurrent receipt creations: all numbers must be unique.
 * Scenario D — mixed concurrent invoice + payment + receipt: all numbers unique per type.
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaMssql } from "@prisma/adapter-mssql";
import {
  getNextInvoiceNumber,
  getNextPaymentNumber,
  getNextReceiptNumber,
} from "../services/financial-sequence.service";

// =============================================================================
// Setup
// =============================================================================

async function createClient(): Promise<PrismaClient> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const adapter = new PrismaMssql(url.trim().replace(/^["']|["']$/g, ""));
  return new PrismaClient({ adapter });
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`  FAIL: ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`  PASS: ${message}`);
  }
}

function allUnique(values: string[]): boolean {
  return new Set(values).size === values.length;
}

// =============================================================================
// Scenario A — 100 concurrent invoice number allocations
// =============================================================================

async function scenarioA(prisma: PrismaClient): Promise<void> {
  console.log("\n── Scenario A: 100 concurrent invoice number allocations ──");
  const CONCURRENCY = 100;

  const numbers = await Promise.all(
    Array.from({ length: CONCURRENCY }, () =>
      prisma.$transaction(async (tx) => getNextInvoiceNumber(tx))
    )
  );

  console.log(`  Allocated ${numbers.length} numbers. Sample: ${numbers.slice(0, 5).join(", ")} ...`);
  assert(numbers.length === CONCURRENCY, `exactly ${CONCURRENCY} numbers allocated`);
  assert(allUnique(numbers), "all ${CONCURRENCY} invoice numbers are unique");
  assert(
    numbers.every((n) => /^FAT-\d+$/.test(n)),
    "all numbers match FAT-NNNNNN format"
  );
}

// =============================================================================
// Scenario B — 100 concurrent payment number allocations
// =============================================================================

async function scenarioB(prisma: PrismaClient): Promise<void> {
  console.log("\n── Scenario B: 100 concurrent payment number allocations ──");
  const CONCURRENCY = 100;

  const numbers = await Promise.all(
    Array.from({ length: CONCURRENCY }, () =>
      prisma.$transaction(async (tx) => getNextPaymentNumber(tx))
    )
  );

  console.log(`  Allocated ${numbers.length} numbers. Sample: ${numbers.slice(0, 5).join(", ")} ...`);
  assert(numbers.length === CONCURRENCY, `exactly ${CONCURRENCY} numbers allocated`);
  assert(allUnique(numbers), `all ${CONCURRENCY} payment numbers are unique`);
  assert(
    numbers.every((n) => /^PAG-\d+$/.test(n)),
    "all numbers match PAG-NNNNNN format"
  );
}

// =============================================================================
// Scenario C — 100 concurrent receipt number allocations
// =============================================================================

async function scenarioC(prisma: PrismaClient): Promise<void> {
  console.log("\n── Scenario C: 100 concurrent receipt number allocations ──");
  const CONCURRENCY = 100;

  const numbers = await Promise.all(
    Array.from({ length: CONCURRENCY }, () =>
      prisma.$transaction(async (tx) => getNextReceiptNumber(tx))
    )
  );

  console.log(`  Allocated ${numbers.length} numbers. Sample: ${numbers.slice(0, 5).join(", ")} ...`);
  assert(numbers.length === CONCURRENCY, `exactly ${CONCURRENCY} numbers allocated`);
  assert(allUnique(numbers), `all ${CONCURRENCY} receipt numbers are unique`);
  assert(
    numbers.every((n) => /^REC-\d+$/.test(n)),
    "all numbers match REC-NNNNNN format"
  );
}

// =============================================================================
// Scenario D — mixed concurrent allocations across all three sequences
// =============================================================================

async function scenarioD(prisma: PrismaClient): Promise<void> {
  console.log("\n── Scenario D: 100 mixed concurrent allocations (all three types) ──");
  const CONCURRENCY_EACH = 33; // ~100 total

  const [invoiceNums, paymentNums, receiptNums] = await Promise.all([
    Promise.all(
      Array.from({ length: CONCURRENCY_EACH }, () =>
        prisma.$transaction(async (tx) => getNextInvoiceNumber(tx))
      )
    ),
    Promise.all(
      Array.from({ length: CONCURRENCY_EACH }, () =>
        prisma.$transaction(async (tx) => getNextPaymentNumber(tx))
      )
    ),
    Promise.all(
      Array.from({ length: CONCURRENCY_EACH }, () =>
        prisma.$transaction(async (tx) => getNextReceiptNumber(tx))
      )
    ),
  ]);

  assert(allUnique(invoiceNums), `${CONCURRENCY_EACH} concurrent invoice numbers are all unique`);
  assert(allUnique(paymentNums), `${CONCURRENCY_EACH} concurrent payment numbers are all unique`);
  assert(allUnique(receiptNums), `${CONCURRENCY_EACH} concurrent receipt numbers are all unique`);

  // Sequences are independent — invoice numbers must not collide with payment or receipt numbers
  const allNumbers = [...invoiceNums, ...paymentNums, ...receiptNums];
  const prefixes = allNumbers.map((n) => n.split("-")[0]);
  const uniquePrefixes = new Set(prefixes);
  assert(uniquePrefixes.size === 3, "three distinct prefixes (FAT, PAG, REC) are present");
}

// =============================================================================
// Entry point
// =============================================================================

async function main(): Promise<void> {
  const orgId = process.env.TEST_ORG_ID;
  const studentId = process.env.TEST_STUDENT_ID;

  if (!orgId || !studentId) {
    console.error(
      "Missing required environment variables:\n" +
        "  TEST_ORG_ID     — an existing Organisation.id\n" +
        "  TEST_STUDENT_ID — an existing Student.id in that organisation"
    );
    process.exit(1);
  }

  const prisma = await createClient();
  try {
    await scenarioA(prisma);
    await scenarioB(prisma);
    await scenarioC(prisma);
    await scenarioD(prisma);

    const exitCode = process.exitCode ?? 0;
    console.log(
      exitCode === 0
        ? "\n✓ All scenarios passed — sequence numbers are unique and race-condition-free."
        : "\n✗ One or more scenarios FAILED — review output above."
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
