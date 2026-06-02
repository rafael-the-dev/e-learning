import sql from "mssql";

// =============================================================================
// MSSQL CONNECTION POOL
// Parses the Prisma SQL Server URL format into an mssql config object.
// Format: sqlserver://HOST:PORT;database=DB;user=USER;password=PASS;...
// =============================================================================

function parseSqlServerUrl(url: string): sql.config {
  const withoutScheme = url.replace(/^sqlserver:\/\//, "");
  const [serverPart, ...paramParts] = withoutScheme.split(";");

  const params: Record<string, string> = {};
  for (const part of paramParts) {
    const eqIdx = part.indexOf("=");
    if (eqIdx === -1) continue;
    const key = part.slice(0, eqIdx).toLowerCase().trim();
    const val = part.slice(eqIdx + 1).trim();
    params[key] = val;
  }

  const colonIdx = serverPart.lastIndexOf(":");
  const commaIdx = serverPart.lastIndexOf(",");
  const sepIdx = Math.max(colonIdx, commaIdx);

  const server = sepIdx > 0 ? serverPart.slice(0, sepIdx) : serverPart;
  const port = sepIdx > 0 ? parseInt(serverPart.slice(sepIdx + 1)) : 1433;

  return {
    server,
    port,
    database: params["database"] ?? params["initial catalog"],
    user: params["user"] ?? params["user id"] ?? params["uid"],
    password: params["password"] ?? params["pwd"],
    options: {
      encrypt: params["encrypt"] !== "false",
      trustServerCertificate:
        params["trustservercertificate"] === "true" ||
        params["encrypt"] === "false",
      enableArithAbort: true,
    },
  };
}

const globalForMssql = globalThis as unknown as { mssqlPool?: sql.ConnectionPool };

export async function getMssqlPool(): Promise<sql.ConnectionPool> {
  if (globalForMssql.mssqlPool?.connected) {
    return globalForMssql.mssqlPool;
  }

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL environment variable is not set");

  const config = parseSqlServerUrl(url);
  const pool = new sql.ConnectionPool(config);
  await pool.connect();

  if (process.env.NODE_ENV !== "production") {
    globalForMssql.mssqlPool = pool;
  }

  return pool;
}
