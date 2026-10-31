import type { Prisma } from "@/generated/prisma/client"

// What a read function takes when it can run inside a transaction: the
// transaction client. The app's `db` is assignable to it, so callers outside a
// transaction pass nothing and get `db`. A read made through `db` from inside
// a transaction takes a second connection from a pool of ten while the first
// is held, so concurrent writers could starve each other
// (docs/specs/030-place-an-order, plan point 1).
export type DbClient = Prisma.TransactionClient
