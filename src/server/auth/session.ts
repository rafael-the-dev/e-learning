import { auth } from "@/server/auth";
import { AuthorizationError } from "@/shared/lib/command";
import type { ServiceContext } from "@/shared/types/common";
import { headers } from "next/headers";

// =============================================================================
// SESSION HELPERS
// Used in Server Actions and Route Handlers to build ServiceContext.
// =============================================================================

export async function getSession() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new AuthorizationError("You must be logged in");
  }
  return session;
}

export async function requireServiceContext(
  organizationId: string
): Promise<ServiceContext> {
  const session = await getSession();
  const headerList = await headers();

  return {
    userId: session.user.id,
    organizationId,
    ipAddress: headerList.get("x-forwarded-for") ?? undefined,
    userAgent: headerList.get("user-agent") ?? undefined,
  };
}
