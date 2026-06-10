import { requireOrganization } from "@/server/auth/context";
import type { Permission } from "@/server/auth/permissions";
import { NAVIGATION_GROUPS } from "./nav-config";
import { NavLinksClient } from "./nav-links-client";

// Server component — fetches permissions server-side and passes
// only the allowed hrefs to the client renderer.
// requireOrganization() is React.cache()-wrapped so this adds zero
// extra DB queries when layout.tsx already resolved the session.
export async function NavLinks() {
  let allowedHrefs: string[];

  try {
    const ctx = await requireOrganization();
    allowedHrefs = NAVIGATION_GROUPS.flatMap((g) => g.items)
      .filter((item) => !item.requiredPermission || ctx.ability.can(item.requiredPermission as Permission))
      .map((item) => item.href);
  } catch {
    allowedHrefs = [];
  }

  const allowedSet = new Set(allowedHrefs);

  const visibleGroups = NAVIGATION_GROUPS
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => allowedSet.has(item.href)),
    }))
    .filter((group) => group.items.length > 0);

  return <NavLinksClient groups={visibleGroups} />;
}
