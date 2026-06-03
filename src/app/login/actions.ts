"use server";

import { getSession } from "@/server/auth/session";
import { isSuperAdmin } from "@/server/auth/rbac";

/**
 * Resolves where to send the user after a successful login.
 * Role check is always server-side — never trust client for routing decisions.
 */
export async function getPostLoginRedirect(): Promise<string> {
  try {
    const session = await getSession();
    const superAdmin = await isSuperAdmin(session.user!.id!);
    return superAdmin ? "/organizations" : "/dashboard";
  } catch {
    return "/login";
  }
}
