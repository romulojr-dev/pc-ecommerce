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

// One line per released or skipped order (docs/specs/033-release-unpaid-
// orders, rule Logging): JSON with only these fields. Never a secret, a token,
// a cart id, a URL or a shopper's details.
export type ReleaseLogFields = {
  outcome: "released" | "skipped"
  orderNumber: string
  via: "purchase" | "sweep" | "cron"
  // A gateway failure code, a reconcile outcome, "locked", "budget" or
  // "no-reservation"
  code?: string
}

export function logReleaseEvent(fields: ReleaseLogFields): void {
  console.info(
    JSON.stringify({
      event: "order.release",
      outcome: fields.outcome,
      orderNumber: fields.orderNumber,
      via: fields.via,
      code: fields.code,
    })
  )
}

// The cron's summary line, or its refusal
export function logCronEvent(
  fields:
    | { released: number; skipped: number; emails: number; failed?: string[] }
    | { outcome: "unauthorized" }
): void {
  console.info(JSON.stringify({ event: "order.release.cron", ...fields }))
}

// One line per confirmation of a cash order (docs/specs/038-cash-on-delivery,
// rule Logging): JSON with the event, the outcome and, for an order that was
// found, its number. Never the link, signature, token, address or details. A
// link that opens nothing logs no number.
export type CodConfirmLogFields = {
  outcome: "confirmed" | "already" | "expired" | "not-found"
  orderNumber?: string
}

export function logCodEvent(fields: CodConfirmLogFields): void {
  console.info(
    JSON.stringify({
      event: "order.cod_confirm",
      outcome: fields.outcome,
      orderNumber: fields.orderNumber,
    })
  )
}
