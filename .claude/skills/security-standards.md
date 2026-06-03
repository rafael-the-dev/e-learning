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