// =============================================================================
// IN-MEMORY FAKE PRISMA — Transcript repository tests (Phase 2)
// -----------------------------------------------------------------------------
// The Transcript repositories all accept an optional `client?: PrismaClientOrTx`
// and fall back to `getDb()` only when it is omitted. Tests pass this fake as the
// client, so no module mock and no real DB connection are needed. The fake
// actually FILTERS by the `where` clause, which lets the tenant-isolation tests
// prove behaviour ("does not return another org's row") rather than merely
// asserting the shape of the query.
//
// Supported surface (all the repos use): create / findFirst / findMany / count /
// updateMany, plus findUnique / update (compound-unique `where` selectors like
// `{ organizationId_year: { … } }` are flattened to equality conditions), with
// equality + `{ in: [...] }` where-matching, `{ increment }`/`{ decrement }` in
// `data`, top-level scalar orderBy (single or array, asc/desc), and skip/take.
// `select` is intentionally ignored — stored rows carry every field and the repo
// mappers pick what they need. Nested-relation `select`/`orderBy` (used only by
// the source repo) is a no-op here; those tests assert verbatim pass-through and
// org-scoping, not order.
// =============================================================================

import type { PrismaClientOrTx } from "@/server/db";

type Row = Record<string, unknown>;
type WhereInput = Record<string, unknown>;

const FIXED_DATE = new Date("2026-01-01T00:00:00.000Z");

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v) && !(v instanceof Date);
}

function matchWhere(row: Row, where: WhereInput): boolean {
  for (const [key, cond] of Object.entries(where)) {
    if (cond === undefined) continue;

    if (cond === null) {
      // Prisma `field: null` matches rows where the column is null OR unset.
      if (row[key] != null) return false;
      continue;
    }

    if (cond instanceof Date) {
      const rv = row[key];
      if (!(rv instanceof Date) || rv.getTime() !== cond.getTime()) return false;
      continue;
    }

    if (isPlainObject(cond)) {
      if ("in" in cond) {
        const list = cond.in as unknown[];
        if (!list.includes(row[key])) return false;
        continue;
      }
      if ("not" in cond) {
        // `{ not: X }` matches rows where the column !== X (`{ not: null }`
        // matches non-null rows).
        const nv = cond.not;
        if (nv === null) {
          if (row[key] == null) return false;
        } else if (row[key] === nv) {
          return false;
        }
        continue;
      }
      // Nested relation filter — not used by these repos; treat as a no-op.
      continue;
    }

    if (row[key] !== cond) return false;
  }
  return true;
}

/** Flatten a findUnique/update `where` into plain equality conditions. A
 *  compound-unique selector (e.g. `{ organizationId_year: { organizationId, year } }`)
 *  is a plain object with no query operator — spread its inner fields. Scalars,
 *  Dates, and operator objects (`{ in }`, `{ not }`) pass through unchanged. */
function flattenUniqueWhere(where: WhereInput): WhereInput {
  const out: WhereInput = {};
  for (const [key, val] of Object.entries(where ?? {})) {
    if (isPlainObject(val) && !("in" in val) && !("not" in val)) {
      for (const [k, v] of Object.entries(val)) out[k] = v;
    } else {
      out[key] = val;
    }
  }
  return out;
}

/** Apply a Prisma `data` payload to a row in place, honouring atomic
 *  `{ increment }`/`{ decrement }` number operators; everything else is a set. */
function applyData(row: Row, data: Row): void {
  for (const [key, val] of Object.entries(data)) {
    if (isPlainObject(val) && ("increment" in val || "decrement" in val)) {
      const current = typeof row[key] === "number" ? (row[key] as number) : 0;
      if ("increment" in val) row[key] = current + (val.increment as number);
      else row[key] = current - (val.decrement as number);
    } else {
      row[key] = val;
    }
  }
}

function scalarOrderSpecs(orderBy: unknown): Array<[string, "asc" | "desc"]> {
  if (!orderBy) return [];
  const specs = Array.isArray(orderBy) ? orderBy : [orderBy];
  const out: Array<[string, "asc" | "desc"]> = [];
  for (const spec of specs) {
    if (!isPlainObject(spec)) continue;
    for (const [key, dir] of Object.entries(spec)) {
      if (dir === "asc" || dir === "desc") out.push([key, dir]);
      // nested-relation orderBy (dir is an object) is skipped
    }
  }
  return out;
}

function applyOrder(rows: Row[], orderBy: unknown): Row[] {
  const specs = scalarOrderSpecs(orderBy);
  if (specs.length === 0) return rows;
  return [...rows].sort((a, b) => {
    for (const [key, dir] of specs) {
      const av = a[key];
      const bv = b[key];
      let cmp = 0;
      if (av == null && bv == null) cmp = 0;
      else if (av == null) cmp = -1;
      else if (bv == null) cmp = 1;
      else if (av instanceof Date && bv instanceof Date) cmp = av.getTime() - bv.getTime();
      else if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
      else cmp = String(av).localeCompare(String(bv));
      if (cmp !== 0) return dir === "desc" ? -cmp : cmp;
    }
    return 0;
  });
}

interface FakeModel {
  create(args: { data: Row; select?: unknown }): Promise<Row>;
  findFirst(args: { where?: WhereInput; select?: unknown; orderBy?: unknown }): Promise<Row | null>;
  findUnique(args: { where: WhereInput; select?: unknown }): Promise<Row | null>;
  findMany(args: {
    where?: WhereInput;
    select?: unknown;
    orderBy?: unknown;
    skip?: number;
    take?: number;
  }): Promise<Row[]>;
  count(args: { where?: WhereInput }): Promise<number>;
  update(args: { where: WhereInput; data: Row; select?: unknown }): Promise<Row>;
  updateMany(args: { where?: WhereInput; data: Row }): Promise<{ count: number }>;
}

function makeModel(name: string): FakeModel & { __store: Row[]; __seed(row: Row): Row } {
  const store: Row[] = [];
  let seq = 0;

  const insert = (data: Row): Row => {
    const row: Row = { ...data };
    if (row.id == null) row.id = `${name}-${++seq}`;
    if (!("createdAt" in row)) row.createdAt = FIXED_DATE;
    if (!("updatedAt" in row)) row.updatedAt = FIXED_DATE;
    store.push(row);
    return row;
  };

  return {
    __store: store,
    __seed: (row: Row) => insert(row),
    create: async ({ data }) => ({ ...insert(data) }),
    findFirst: async ({ where, orderBy }) => {
      const matched = applyOrder(store.filter((r) => matchWhere(r, where ?? {})), orderBy);
      return matched.length ? { ...matched[0] } : null;
    },
    findUnique: async ({ where }) => {
      const flat = flattenUniqueWhere(where);
      const match = store.find((r) => matchWhere(r, flat));
      return match ? { ...match } : null;
    },
    findMany: async ({ where, orderBy, skip, take }) => {
      let matched = applyOrder(store.filter((r) => matchWhere(r, where ?? {})), orderBy);
      if (typeof skip === "number") matched = matched.slice(skip);
      if (typeof take === "number") matched = matched.slice(0, take);
      return matched.map((r) => ({ ...r }));
    },
    count: async ({ where }) => store.filter((r) => matchWhere(r, where ?? {})).length,
    update: async ({ where, data }) => {
      const flat = flattenUniqueWhere(where);
      const row = store.find((r) => matchWhere(r, flat));
      if (!row) throw new Error(`fake ${name}.update: record not found`);
      applyData(row, data);
      return { ...row };
    },
    updateMany: async ({ where, data }) => {
      let count = 0;
      for (const r of store) {
        if (matchWhere(r, where ?? {})) {
          applyData(r, data);
          count += 1;
        }
      }
      return { count };
    },
  };
}

export type FakeDb = Record<string, ReturnType<typeof makeModel>>;

/** Build a fresh in-memory DB. Model delegates are created lazily on first
 *  access, so any Prisma model name works without an up-front registry.
 *
 *  Also exposes `$transaction(fn)` with real ROLLBACK semantics: every model's
 *  store is snapshotted (shallow row copies) before the callback runs; if the
 *  callback throws, all stores are restored (rows created mid-transaction are
 *  discarded) and the error re-throws. This lets command tests prove
 *  "rollback leaves zero rows" behaviourally, not just structurally. */
export function makeFakeDb(): FakeDb {
  const models = new Map<string, ReturnType<typeof makeModel>>();

  // Reads `proxy` only at call time (after it is assigned below), so the const
  // declaration order is safe.
  const transaction = async <T>(fn: (tx: FakeDb) => Promise<T> | T): Promise<T> => {
    const backup = new Map<ReturnType<typeof makeModel>, Row[]>();
    for (const model of models.values()) {
      backup.set(model, model.__store.map((r) => ({ ...r })));
    }
    try {
      return await fn(proxy);
    } catch (err) {
      for (const model of models.values()) {
        const rows = backup.get(model);
        model.__store.length = 0;
        if (rows) model.__store.push(...rows);
      }
      throw err;
    }
  };

  const proxy: FakeDb = new Proxy({} as FakeDb, {
    get(_target, prop) {
      if (typeof prop !== "string") return undefined;
      if (prop === "$transaction") return transaction;
      let model = models.get(prop);
      if (!model) {
        model = makeModel(prop);
        models.set(prop, model);
      }
      return model;
    },
  });
  return proxy;
}

/** Seed a row directly into a model's store (bypasses `create`). */
export function seed(db: FakeDb, model: string, row: Row): Row {
  return db[model].__seed(row);
}

/** Cast the fake to the repository `client` parameter type (structural only). */
export function asClient(db: FakeDb): PrismaClientOrTx {
  return db as unknown as PrismaClientOrTx;
}
