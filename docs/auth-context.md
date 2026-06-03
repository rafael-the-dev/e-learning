# Auth Context & Tenant Isolation

## Overview

Every authenticated request in this application resolves three things before touching business logic:

1. **Who is the user?** — verified from the JWT session
2. **Which organization are they acting on?** — resolved server-side, never from client input
3. **What are they allowed to do?** — loaded from the database and exposed as an `Ability`

All of this lives in `src/server/auth/context.ts`. No other layer should re-implement any part of it.

---

## How Active Organization Is Resolved

Users can belong to more than one organization. The active org is resolved in this order:

```
1. Cookie `elearning_active_org`
      ↓ validate: user must be a member of the org in the cookie
2. First UserOrganization (ordered by joinedAt ASC)
      ↓ fallback when cookie is absent or invalid
3. AuthorizationError — user has no organization
```

The cookie is set server-side only (via `setActiveOrg()`), is `httpOnly`, and is validated against the database on every request. A client cannot forge access to an org they don't belong to.

```ts
// src/server/auth/context.ts
export const ACTIVE_ORG_COOKIE = "elearning_active_org";

// Sets the active org after validating membership — call from a Server Action
export async function setActiveOrg(organizationId: string): Promise<void>
```

**Multi-org switching** (when building the UI): call `setActiveOrg(orgId)` from a Server Action. The cookie persists for 30 days. The next request to `getActiveOrganization()` or `requireOrganization()` will pick up the new org automatically.

---

## How Permissions Work

Permissions are stored in the database per role, loaded at request time, and exposed through an `Ability` object.

```
UserRole (userId + organizationId + roleId)
  └─ Role
       └─ RolePermission[]
            └─ Permission (module + action → "students.create")
```

The `PERMISSIONS` catalog in `src/server/auth/permissions.ts` is the single source of truth. All permission strings follow the format `module.action`.

```ts
export const PERMISSIONS = {
  STUDENTS_CREATE: "students.create",
  STUDENTS_READ:   "students.read",
  DASHBOARD_VIEW:  "dashboard.view",
  // ...
} as const;
```

The `Ability` object (returned inside `AuthContext`) exposes three checks:

```ts
context.ability.can(PERMISSIONS.STUDENTS_CREATE)       // single permission
context.ability.canAll([PERMISSIONS.A, PERMISSIONS.B]) // all required
context.ability.canAny([PERMISSIONS.A, PERMISSIONS.B]) // at least one
```

Permissions are loaded with React `cache()` — multiple calls in the same render tree hit the database only once.

---

## Auth Helpers

All helpers are in `src/server/auth/context.ts`. Import from there in Server Components, Server Actions, and Route Handlers.

### `getCurrentUser(): Promise<AuthUser>`

Returns the full user record. Throws `AuthorizationError` if unauthenticated or inactive.

```ts
import { getCurrentUser } from "@/server/auth/context";

const user = await getCurrentUser();
// { id, email, name, avatarUrl, isActive }
```

### `getActiveOrganization(): Promise<ActiveOrg>`

Returns `{ id, name, slug }` of the active org. Does **not** load permissions. Use in layouts that only need to display the org name.

```ts
import { getActiveOrganization } from "@/server/auth/context";

const org = await getActiveOrganization();
```

### `requireAuth(): Promise<AuthUser>`

Identical to `getCurrentUser()` — throws if not authenticated. Use as a guard at the top of pages that only need auth, not org context.

### `requireOrganization(): Promise<AuthContext>`

The standard guard for all org-scoped pages and actions. Returns an `AuthContext` that extends `ServiceContext` with `ability` and `roles`.

```ts
import { requireOrganization } from "@/server/auth/context";

const context = await requireOrganization();
// context.userId
// context.organizationId  ← always server-derived, never from client
// context.ability
// context.roles
// context.ipAddress, context.userAgent  ← from request headers
```

`AuthContext` satisfies `ServiceContext`, so it can be passed directly to Command constructors.

### `requirePermission(permission): Promise<AuthContext>`

Calls `requireOrganization()` and throws `AuthorizationError` if the given permission is missing.

```ts
import { requirePermission } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";

const context = await requirePermission(PERMISSIONS.STUDENTS_CREATE);
```

### `requireRole(role): Promise<AuthContext>`

Calls `requireOrganization()` and throws `AuthorizationError` if the user does not hold the given role.

```ts
import { requireRole } from "@/server/auth/context";
import { SYSTEM_ROLES } from "@/server/auth/permissions";

const context = await requireRole(SYSTEM_ROLES.ORG_ADMIN);
```

---

## Guard Pattern for Pages

Every protected page follows the same three-line pattern:

```tsx
// app/(org)/some-page/page.tsx
import { redirect } from "next/navigation";
import { requireRole } from "@/server/auth/context";
import { SYSTEM_ROLES } from "@/server/auth/permissions";
import type { AuthContext } from "@/server/auth/context";

export default async function SomePage() {
  let context: AuthContext;
  try {
    context = await requireRole(SYSTEM_ROLES.ORG_ADMIN);
  } catch {
    redirect("/forbidden");
  }

  // All business logic uses context.organizationId — never a prop or param
  const data = await someService.getData(context.organizationId);
  ...
}
```

- Authentication failures → `redirect("/forbidden")` (middleware already handles true unauthentication at the edge)
- Authorization failures → `redirect("/forbidden")`

For pages that only need authentication (no specific role), use `requireOrganization()`. For permission-level checks, use `requirePermission()`.

---

## Guard Pattern for Server Actions

```ts
"use server";

import { requirePermission } from "@/server/auth/context";
import { PERMISSIONS } from "@/server/auth/permissions";
import { AuthorizationError } from "@/shared/lib/command";
import { runAction } from "@/shared/lib/action";

export async function createStudentAction(input: CreateStudentInput) {
  return runAction(async () => {
    const context = await requirePermission(PERMISSIONS.STUDENTS_CREATE);
    const cmd = new CreateStudentCommand(input, context);
    return cmd.run();
  });
}
```

`runAction()` catches `AuthorizationError` and returns `{ success: false, error: "..." }` — the client receives a typed error without a redirect.

---

## How Future Modules Must Use `organizationId`

### Rule: `organizationId` comes from the server. Always.

```ts
// ✅ CORRECT — organizationId from requireOrganization()
export async function listStudentsAction() {
  return runAction(async () => {
    const context = await requirePermission(PERMISSIONS.STUDENTS_READ);
    return studentRepository.findAll(context.organizationId);
  });
}

// ❌ WRONG — organizationId accepted from client
export async function listStudentsAction(organizationId: string) {
  return runAction(async () => {
    return studentRepository.findAll(organizationId); // tenant isolation broken
  });
}
```

### Repository Layer

Every repository function that touches org-scoped data must receive `organizationId` as a parameter and include it in every query:

```ts
// ✅ CORRECT
export async function findStudents(organizationId: string) {
  const db = await getDb();
  return db.student.findMany({
    where: { organizationId },  // ← always filter by org
  });
}

// ❌ WRONG — missing org filter leaks data across tenants
export async function findStudents() {
  const db = await getDb();
  return db.student.findMany(); // returns ALL students from ALL orgs
}
```

### Prisma Calls Stay in Repositories

```ts
// ✅ CORRECT — Prisma only in repository
// src/modules/students/repositories/student.repository.ts
export async function findStudents(organizationId: string) {
  const db = await getDb();
  return db.student.findMany({ where: { organizationId } });
}

// ❌ WRONG — Prisma in a React component
export default function StudentList() {
  const db = getDbSync(); // ← never
  const students = db.student.findMany();
  ...
}
```

---

## Tenant-Scoped Query Examples

### ✅ Correct: filter by organizationId on every query

```ts
// List — always include organizationId in where
const students = await db.student.findMany({
  where: { organizationId },
});

// Single record — always verify it belongs to the org
const student = await db.student.findFirst({
  where: { id: studentId, organizationId },
});
// If null → the record doesn't exist OR doesn't belong to this org → 404

// Count
const count = await db.student.count({
  where: { organizationId, status: "ACTIVE" },
});

// Aggregation
const result = await db.invoice.aggregate({
  where: { organizationId, status: "PENDING" },
  _sum: { amount: true },
});
```

### ❌ Incorrect: missing organizationId

```ts
// Leaks data from other orgs
const student = await db.student.findUnique({ where: { id: studentId } });

// Aggregate across all orgs
const result = await db.invoice.aggregate({ _sum: { amount: true } });
```

---

## Middleware (`src/proxy.ts`)

The edge middleware intercepts every request before it reaches a page or action:

- **Unauthenticated + non-public path** → redirect to `/login?callbackUrl=<path>`
- **Authenticated + `/login`** → redirect to `/dashboard`
- **All other authenticated requests** → pass through

Deep authorization (role/permission checks) is **not** done in middleware because it requires database access, which is unavailable in the Edge runtime. Authorization happens in pages and Server Actions via `requireRole()` / `requirePermission()`.

Public paths (no auth required): `/`, `/login`, `/api/auth/*`

---

## Error Types

| Error | Where thrown | Meaning |
|---|---|---|
| `AuthorizationError` | `context.ts` guards | Not authenticated, inactive user, no org, wrong role/permission |
| `ValidationError` | Command `validate()` | Input failed schema or business rule |
| `NotFoundError` | Repositories | Record not found |
| `BusinessRuleError` | Command `execute()` | Violated a domain constraint |

Pages catch `AuthorizationError` and `redirect("/forbidden")`. `runAction()` catches all known error types and returns a typed `ActionResult<T>`.

---

## File Map

```
src/server/auth/
  config.ts          — Edge-compatible NextAuth config (no DB imports)
  index.ts           — Full NextAuth with Credentials provider
  context.ts         — ★ Active org resolution, all guard helpers
  permissions.ts     — PERMISSIONS catalog, SYSTEM_ROLES, ROLE_PERMISSIONS
  rbac.ts            — getUserPermissions, createAbility, isSuperAdmin, isOrgAdmin
  session.ts         — Legacy helpers (requireOrgContext, getOrgSession) delegating to context.ts

src/proxy.ts         — Edge middleware: authentication check, public path list
src/app/forbidden/   — 403 page for authorization failures
```
