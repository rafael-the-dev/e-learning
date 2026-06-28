/**
 * Canonical email normalization used everywhere we look up or store a User by
 * email. Trims surrounding whitespace and lower-cases the address so that
 * provisioning/lookup is consistent across surfaces (student & guardian
 * provisioning, invites) and never creates a duplicate that differs only in
 * case. Returns an empty string for nullish/blank input so callers can treat
 * "no email" uniformly.
 */
export function normalizeEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}
