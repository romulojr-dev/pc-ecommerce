import { config } from "dotenv"

// `pnpm payments:check`: answers spec 031's test-mode questions against the
// Xendit test account in .env.local (docs/specs/031-pay-with-xendit, Q2, Q6,
// Q8). It never prints the key: only whether it has the test prefix.
//
//   1. Does XENDIT_SECRET_KEY start with xnd_development_? (Q6)
//   2. Create a ₱19.99 session that expires in 24 hours (Q8 centavos, Q2
//      lifetime), and print what Xendit answers
//   3. Cancel it, then cancel it again (the second should be a 422)
//
// `--keep` skips step 3, so the printed link can be opened to try GCash and
// Maya (Q4). The session then expires by itself after 24 hours.
//
// A standalone script on purpose: it reads only XENDIT_SECRET_KEY, not
// @/lib/env, so it runs before the app's payment variables exist.
config({ path: ".env.local", quiet: true })

const API = "https://api.xendit.co"
const TEST_PREFIX = "xnd_development_"
const LIVE_PREFIX = "xnd_production_"

const key = process.env.XENDIT_SECRET_KEY ?? ""
const keep = process.argv.includes("--keep")

if (!key) {
  console.error("XENDIT_SECRET_KEY is not set in .env.local.")
  process.exit(1)
}
console.log(`Key starts with ${TEST_PREFIX}: ${key.startsWith(TEST_PREFIX)}`)
if (key.startsWith(LIVE_PREFIX)) {
  console.error("That is a live key. Stopping: the store only uses test mode.")
  process.exit(1)
}

const headers = {
  Authorization: `Basic ${Buffer.from(`${key}:`).toString("base64")}`,
  "Content-Type": "application/json",
}

// Only the fields the questions need; never the whole body, which can echo
// the request
type Session = {
  payment_session_id?: string
  status?: string
  amount?: unknown
  currency?: string
  expires_at?: string
  payment_link_url?: string
  error_code?: string
  message?: string
}

async function call(method: string, path: string, body?: unknown) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  })
  const json = (await response.json().catch(() => ({}))) as Session
  return { status: response.status, json }
}

function show(
  label: string,
  { status, json }: Awaited<ReturnType<typeof call>>
) {
  console.log(`\n${label}: HTTP ${status}`)
  if (json.error_code) {
    console.log(`  error_code: ${json.error_code}`)
    console.log(`  message: ${json.message ?? ""}`)
    return
  }
  for (const field of [
    "payment_session_id",
    "status",
    "amount",
    "currency",
    "expires_at",
    "payment_link_url",
  ] as const) {
    if (json[field] !== undefined) console.log(`  ${field}: ${json[field]}`)
  }
}

// `--read ps-…`: after paying a `--keep` session, read it and its payment
// (docs/specs/032-payment-webhooks, Q3: does GET /v3/payments take the
// session's payment_id?). Prints statuses and id prefixes only.
const readAt = process.argv.indexOf("--read")
if (readAt !== -1) {
  const sessionId = process.argv[readAt + 1] ?? ""
  if (!/^ps-[0-9a-f]{24}$/.test(sessionId)) {
    console.error("Usage: pnpm payments:check --read <ps-…>")
    process.exit(1)
  }
  await readPaid(sessionId)
  process.exit(0)
}

async function readPaid(sessionId: string) {
  const prefix = (value: unknown) =>
    typeof value === "string" ? `${value.split("-")[0]}-…` : "absent"

  const session = await fetch(`${API}/sessions/${sessionId}`, {
    headers,
    signal: AbortSignal.timeout(15_000),
  })
  const s = (await session.json().catch(() => ({}))) as Record<string, unknown>
  console.log(`\nRead the session: HTTP ${session.status}`)
  console.log(`  status: ${s.status}`)
  console.log(`  payment_id: ${prefix(s.payment_id)}`)
  console.log(`  payment_request_id: ${prefix(s.payment_request_id)}`)
  if (typeof s.payment_id !== "string") return

  const payment = await fetch(
    `${API}/v3/payments/${encodeURIComponent(s.payment_id)}`,
    {
      headers: { ...headers, "api-version": "2024-11-11" },
      signal: AbortSignal.timeout(15_000),
    }
  )
  const p = (await payment.json().catch(() => ({}))) as Record<string, unknown>
  console.log(
    `\nRead its payment (GET /v3/payments/{payment_id}): HTTP ${payment.status}`
  )
  if (typeof p.error_code === "string") {
    console.log(`  error_code: ${p.error_code}`)
    return
  }
  for (const field of [
    "status",
    "channel_code",
    "request_amount",
    "currency",
  ]) {
    console.log(`  ${field}: ${p[field]}`)
  }
}

const expiresAt = new Date(Date.now() + 24 * 3_600_000)
const stamp = Date.now().toString(36).toUpperCase()

const created = await call("POST", "/sessions", {
  reference_id: `PCS-CHECK-${stamp}`,
  session_type: "PAY",
  mode: "PAYMENT_LINK",
  currency: "PHP",
  country: "PH",
  amount: 19.99,
  allowed_payment_channels: ["GCASH", "PAYMAYA", "CARDS"],
  expires_at: expiresAt.toISOString(),
  description: "PC Silicon payments check (spec 031)",
  metadata: { environment: "development", purpose: "payments-check" },
  success_return_url: "https://example.com/pcsilicon/return",
  cancel_return_url: "https://example.com/pcsilicon/cancel",
})
show("Create a ₱19.99 session expiring in 24 h", created)
console.log(`  requested expires_at: ${expiresAt.toISOString()}`)

const id = created.json.payment_session_id
if (id && !keep) {
  show("Cancel it", await call("POST", `/sessions/${id}/cancel`))
  show(
    "Cancel it again (expect 422)",
    await call("POST", `/sessions/${id}/cancel`)
  )
} else if (id) {
  console.log(
    "\n--keep: left open. Open payment_link_url to try GCash and Maya."
  )
}
