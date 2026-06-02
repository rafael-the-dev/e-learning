"use client";

import * as React from "react";
import type { Permission } from "@/server/auth/permissions";

// =============================================================================
// PERMISSION GATE
// Renders children only when the current user has the required permission(s).
// The permissions prop is passed from a server component that resolved
// the user's ability — never fetched client-side.
// =============================================================================

interface PermissionGateProps {
  permission: Permission | Permission[];
  userPermissions: Set<string> | string[];
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export function PermissionGate({
  permission,
  userPermissions,
  fallback = null,
  children,
}: PermissionGateProps) {
  const permSet =
    userPermissions instanceof Set
      ? userPermissions
      : new Set(userPermissions);

  const required = Array.isArray(permission) ? permission : [permission];
  const allowed = required.every((p) => permSet.has(p));

  return allowed ? <>{children}</> : <>{fallback}</>;
}
