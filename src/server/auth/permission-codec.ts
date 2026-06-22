// =============================================================================
// PERMISSION CODEC
// Permission constants follow "module.action", but some action names contain
// dots themselves (e.g. "integrity.issues.view"). Splitting naively on every
// "." truncates those and can collide two distinct permissions into the same
// (module, action) pair. The module is always the first segment; the action
// is everything after the first dot, verbatim — so encode/decode round-trip
// exactly for every code in the catalog.
// =============================================================================

export interface ParsedPermissionCode {
  module: string;
  action: string;
}

export function parsePermissionCode(code: string): ParsedPermissionCode {
  const separatorIndex = code.indexOf(".");
  if (separatorIndex === -1) {
    throw new Error(`Invalid permission code "${code}": missing "module.action" separator`);
  }
  return {
    module: code.slice(0, separatorIndex),
    action: code.slice(separatorIndex + 1),
  };
}

export function buildPermissionCode(module: string, action: string): string {
  return `${module}.${action}`;
}
