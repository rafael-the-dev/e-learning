# BUG-PREREQ-001 — `next build` fails (Prerequisites module)

- **Status:** RESOLVED (2026-07-11)
- **Priority:** High (application build blocker)
- **Scope:** OUTSIDE the Examination Portal (Phase 12). Fixed separately, after Phase 12.
- **Owner:** Academic Core / Prerequisites
- **Reported:** 2026-07-11 (during Examination Portal Phase 12, Increment 3)

## Resolution

**Root cause:** `services/review-progression-request.service.ts` carried a top-level
`"use server"` directive while also exporting a **class** (`ProgressionRequestError`) and
result interfaces. A `"use server"` module may export **only async functions** — the illegal
non-async export made the Turbopack server-module transform yield nothing, so the importing
`actions/prerequisite.actions.ts` saw "the module has no exports at all" and the named exports
`approveProgressionRequest` / `rejectProgressionRequest` "didn't exist". `tsc` does not enforce
the "use server" export rule, which is why type-check stayed green while `next build` failed.

**Fix:** removed the `"use server"` directive. This file is a **service** (plain server-side
code invoked only by the `"use server"` actions layer in `actions/prerequisite.actions.ts`),
not a server-actions entrypoint, so it should never have been a server-actions module. One-line
change; no behaviour change, no schema/migration change. It was also the only `"use server"`
file under `prerequisites/services` + `prerequisites/engines` (the rest are correctly plain
modules).

**Validation after fix:** `next build` ✓ (exit 0) · `tsc --noEmit` ✓ (0) ·
`vitest run` ✓ **3976/3977** (the single failure is the unrelated, pre-existing,
date-relative `teacher-portal.repository.test.ts` deadline-ordering test — its fixtures use
absolute past dates) · `eslint` on the changed file ✓ (clean). No examination files involved.

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
