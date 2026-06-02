import { PrismaMssql } from "@prisma/adapter-mssql";
import { PrismaClient } from "@prisma/client";

// =============================================================================
// PRISMA CLIENT — Prisma 7 with @prisma/adapter-mssql
// All callers: const db = await getDb()
//
// PrismaMssql is a factory: it creates and manages the mssql ConnectionPool
// internally when PrismaClient calls adapter.connect(). Pass the URL string
// directly — the adapter's own parser handles the sqlserver:// format.
//
// .env example:
//   DATABASE_URL="sqlserver://localhost:57861;database=mydb;user=sa;password=pass;trustServerCertificate=true;"
// =============================================================================

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaReady?: Promise<PrismaClient>;
};

function createDbPromise(): Promise<PrismaClient> {
  return (async () => {
    const rawUrl = process.env.DATABASE_URL;
    if (!rawUrl) throw new Error("DATABASE_URL environment variable is not set");

    const adapter = new PrismaMssql(rawUrl.trim().replace(/^["']|["']$/g, ""));
    return new PrismaClient({ adapter });
  })();
}

export function getDb(): Promise<PrismaClient> {
  if (globalForPrisma.prisma) return Promise.resolve(globalForPrisma.prisma);

  if (!globalForPrisma.prismaReady) {
    globalForPrisma.prismaReady = createDbPromise().then((client) => {
      if (process.env.NODE_ENV !== "production") {
        globalForPrisma.prisma = client;
      }
      return client;
    });
  }

  return globalForPrisma.prismaReady;
}
