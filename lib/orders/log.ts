// Failure logging that can't leak (docs/specs/030-place-an-order, §4 Logging,
// D15). Postgres's duplicate-key detail repeats the value that clashed and
// Prisma errors can echo the arguments of the query, so an error's message and
// object are never logged by the code that handles the idempotency key, the
// access token or a shopper's details. Only the error's name and a string
// code (a Prisma code or a Postgres SQLSTATE) are.

export function safeErrorText(error: unknown): string {
  if (!(error instanceof Error)) return "unknown error"
  const code = (error as { code?: unknown }).code
  return typeof code === "string" ? `${error.name} (${code})` : error.name
}

// One fixed line: where it failed and what kind of error it was
export function logSafeFailure(where: string, error: unknown): void {
  console.error(`${where} failed: ${safeErrorText(error)}`)
}
