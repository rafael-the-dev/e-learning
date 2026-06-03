# Users Management

## Scope

The Users module allows `ORG_ADMIN` to manage the people who have access to the active organization. It covers listing, creating, editing, disabling, role assignment, and removal from the organization.

This module does **not** manage Students or Teachers as domain entities — those are separate modules with their own data models. A Student or Teacher is a person enrolled in the system's academic records; a User is a person with a login account and org access.

---

## Routes

| Route | Permission | Description |
|---|---|---|
| `/users` | `users.read` | Paginated list with search + filters |
| `/users/new` | `users.create` | Create a new org user |
| `/users/[userId]` | `users.read` | User detail page |
| `/users/[userId]/edit` | `users.update` | Edit name, phone, role |

---

## Permissions

| Permission | Constant | Who has it |
|---|---|---|
| `users.read` | `PERMISSIONS.USERS_READ` | ORG_ADMIN, SECRETARY |
| `users.create` | `PERMISSIONS.USERS_CREATE` | ORG_ADMIN |
| `users.update` | `PERMISSIONS.USERS_UPDATE` | ORG_ADMIN |
| `users.disable` | `PERMISSIONS.USERS_DISABLE` | ORG_ADMIN |
| `roles.assign` | `PERMISSIONS.ROLES_ASSIGN` | ORG_ADMIN |
| `users.delete` | `PERMISSIONS.USERS_DELETE` | ORG_ADMIN |

---

## Commands

### `CreateOrganizationUserCommand`

Creates a new `User`, links them to the active org via `UserOrganization`, and assigns an initial role via `UserRole`.

- Validates email uniqueness across all users
- Rejects `SUPER_ADMIN` role assignment
- Hashes password with bcrypt (cost 12)
- Emits audit: `User / CREATED`

### `UpdateOrganizationUserCommand`

Updates `User.name` and `User.phone`. Email is not editable.

- Verifies user membership in active org
- Emits audit: `User / UPDATED`

### `DisableOrganizationUserCommand`

Sets `User.isActive = false`.

- Rejects if user is already disabled
- Rejects if user is the last active `ORG_ADMIN` in the org
- Rejects if actor is the last `ORG_ADMIN` and is disabling themselves
- Emits audit: `User / STATUS_CHANGED`

### `AssignUserRoleCommand`

Replaces all existing org roles with a single new role.

- Rejects `SUPER_ADMIN` role assignment
- Uses a replace strategy: deletes existing `UserRole` records for this org, then creates one new one
- Emits audit: `User / UPDATED`

### `RemoveUserFromOrganizationCommand`

Removes `UserOrganization` and all `UserRole` entries for the org. Runs in a database transaction.

- Rejects if user is the last active `ORG_ADMIN`
- Rejects if actor is removing themselves as the last `ORG_ADMIN`
- Emits audit: `User / DELETED`

---

## Server Actions

All actions live in `src/modules/users/actions/user.actions.ts`. Each calls `requireOrganization()` internally — `organizationId` is never accepted from the client.

```ts
createOrgUserAction(input: CreateUserSchema): Promise<ActionResult<OrgUser>>
updateOrgUserAction(userId, input: UpdateUserSchema): Promise<ActionResult<OrgUser>>
disableOrgUserAction(userId): Promise<ActionResult<void>>
enableOrgUserAction(userId): Promise<ActionResult<void>>
assignUserRoleAction(userId, roleId): Promise<ActionResult<void>>
removeUserFromOrgAction(userId): Promise<ActionResult<void>>
```

---

## Tenant Isolation Rules

```ts
// ✅ CORRECT — organizationId from requireOrganization()
const context = await requireOrganization();
const users = await getUsersByOrganization(context.organizationId, params);

// ❌ WRONG — never accept organizationId from client input
export async function listUsersAction(organizationId: string) { ... }
```

Every repository function receives `organizationId` as a parameter and includes it in every Prisma query:

```ts
// ✅ Always scope to organizationId
db.user.findMany({
  where: {
    userOrganizations: { some: { organizationId } },
    deletedAt: null,
  },
})

// ✅ Single record — verify org membership too
db.user.findFirst({
  where: { id: userId, userOrganizations: { some: { organizationId } } },
})
```

A user with `userId` that is not a member of `organizationId` returns `null` — never a 403 that leaks record existence.

---

## Role Assignment Rules

1. `ORG_ADMIN` can assign: `ORG_ADMIN`, `SECRETARY`, `TEACHER`, `STUDENT`, and any org-custom roles.
2. `ORG_ADMIN` **cannot** assign `SUPER_ADMIN` under any circumstance.
3. Role assignment is **replace** not **add** — assigning a role removes all previous org roles.
4. The last `ORG_ADMIN` in an org **cannot** be reassigned to a lower role if it would leave the org with zero admins (this constraint is enforced by combining `AssignUserRoleCommand` + `DisableOrganizationUserCommand` validations).

---

## Last ORG_ADMIN Protection

Three operations validate against leaving the org admin-less:

| Operation | Check |
|---|---|
| Disable user | If user has `ORG_ADMIN` role and they are the last active admin → reject |
| Disable self | If actor is the last active admin → reject |
| Remove from org | If user has `ORG_ADMIN` role and they are the last admin → reject |
| Remove self | If actor is the last admin → reject |

`countOrgAdmins(organizationId)` counts active users with `ORG_ADMIN` role. Count ≤ 1 means reject.

---

## Data Model

```
User
  ├─ UserOrganization (userId + organizationId) ← org membership
  └─ UserRole (userId + roleId + organizationId) ← org-scoped role assignment

User.isActive = true  → displayed as "Ativo"
User.isActive = false → displayed as "Desativado"
```

Email is stored on `User` globally — email uniqueness is enforced across all organizations. A user can be a member of multiple organizations simultaneously through `UserOrganization`.

---

## File Map

```
src/modules/users/
  types/index.ts                          — OrgUser, AssignableRole, ROLE_LABELS
  schemas/user.schema.ts                  — Zod schemas
  repositories/user.repository.ts         — All Prisma queries
  services/user.service.ts               — Read operations (no auth)
  commands/
    create-org-user.command.ts
    update-org-user.command.ts
    disable-org-user.command.ts
    assign-user-role.command.ts
    remove-user-from-org.command.ts
  actions/user.actions.ts                — Server Actions
  components/
    user-columns.tsx                     — Table column definitions
    users-table.tsx                      — List + filters + dialogs
    user-form.tsx                        — CreateUserForm, EditUserForm
    user-detail-actions.tsx              — Disable/Enable/Remove buttons

src/app/(org)/users/
  page.tsx                               — List page
  new/page.tsx                           — Create page
  [userId]/page.tsx                      — Detail page
  [userId]/edit/page.tsx                 — Edit page
```
