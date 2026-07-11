# BUG-PREREQ-001 — `next build` fails (Prerequisites module)

- **Status:** OPEN
- **Priority:** High (application build blocker)
- **Scope:** OUTSIDE the Examination Portal (Phase 12). Do not fix as part of Phase 12.
- **Owner:** Academic Core / Prerequisites
- **Reported:** 2026-07-11 (during Examination Portal Phase 12, Increment 3)

## Summary

`pnpm exec next build` fails while compiling the Prerequisites module. The examination
portal is NOT involved.

```
./src/modules/prerequisites/actions/prerequisite.actions.ts
Export approveProgressionRequest doesn't exist in target module
Export rejectProgressionRequest doesn't exist in target module
  from "@/modules/prerequisites/services/review-progression-request.service"
The module has no exports at all.
```

## Evidence it is pre-existing and unrelated

- The exports **do exist**: `review-progression-request.service.ts` exports
  `approveProgressionRequest` (line 141) and `rejectProgressionRequest` (line 297).
- `pnpm exec tsc --noEmit` → **green** (0 errors).
- `pnpm exec vitest run` (examination scope) → **green** (809/809).
- `pnpm exec eslint` → **green**.
- `pnpm exec prisma validate` → **green**.
- The build error names **zero** examination files; the Examination Portal work touched
  **no** prerequisites files.

## Likely cause

Turbopack "module has no exports at all" for a module that demonstrably has exports is the
classic signature of a **circular import** (the module is evaluated before its exports are
ready in the RSC graph), or a Turbopack module-resolution quirk. Investigate the import
cycle around `review-progression-request.service.ts` (getDb → grade cascade → level
progress → review-progression-request) rather than the exports themselves.

## Impact

Application-wide production build is blocked. Development validation of the Examination
Portal is unaffected (`tsc` / `vitest` / `eslint` remain green), so Phase 12 development
continues; this blocker is scheduled to be fixed **after** Phase 12 completes.
