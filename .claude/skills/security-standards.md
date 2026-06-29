---
name: security-standards
description: Enforce security best practices for all application development tasks.
---

# Security Standards

You are a security-first software engineer.

## Authentication & Passwords

### Password Storage
- NEVER store passwords in plain text.
- ALWAYS hash passwords before saving them.
- Use strong hashing algorithms:
  - bcrypt (preferred)
- Never use:
  - MD5
  - SHA1
  - SHA256 alone for passwords

### Password Verification
- Always compare passwords using secure hash verification methods.
- Never implement custom password comparison logic.

### Password Policies
- Minimum length: 8 characters.
- Recommend 12+ characters for production.
- Encourage use of uppercase, lowercase, numbers, and symbols.

---

## Secrets Management

### API Keys & Tokens
- Never hardcode:
  - API keys
  - JWT secrets
  - Database passwords
  - Access tokens
  - Private keys

Example of forbidden code:

```ts
const jwtSecret = "my-secret-key";
```

Correct approach — read from the environment, never commit the value:

```ts
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) throw new Error("JWT_SECRET is not configured");
```

- Keep secrets in `.env` (never committed) and in the deployment platform's secret store.
- Rotate any secret that is ever exposed in logs, errors, or version control.

---

## Authorization & Multi-tenant

- Authorize every request on the server. Never trust the client or the UI.
- Enforce row-level tenant isolation: every query must be scoped by `organizationId` / tenant.
- Use CASL/RBAC for permission checks; never branch on raw role strings ad hoc.
- Default to deny. A missing permission check is a vulnerability, not a TODO.
- Never expose another tenant's data through ids in URLs, payloads, or relations.

---

## Input Validation

- Validate and sanitize all input on the server with Zod, even when the client already validates.
- Never build queries via string concatenation. Use Prisma's parameterized queries.
- Reject unexpected fields; do not blindly spread request bodies into `create`/`update`.

---

## Data Exposure

- Never return `passwordHash`, tokens, or internal fields in API responses.
- Select only the fields the client needs; avoid `include`/`select: *` of sensitive relations.
- Do not leak stack traces, SQL, or secrets in error messages sent to the client.

---

## File Uploads (UploadThing)

- Validate file type, size, and ownership server-side before persisting references.
- Authorize the uploader and scope the file to the correct tenant.
- Never trust client-provided file metadata or paths.

---

## Sessions & Tokens

- Use NextAuth/Auth.js for session handling; do not roll custom session logic.
- Set cookies `httpOnly`, `secure`, `sameSite`.
- Expire and rotate tokens; invalidate sessions on logout and credential change.

---

## Cron & Webhooks

- Protect cron HTTP endpoints with a secret and verify it in constant time.
- Verify webhook signatures before processing payloads.

---

## Final Rule

If a change touches authentication, authorization, tenant isolation, uploads, or data exposure, treat it as security-critical and require explicit review before deploy.
