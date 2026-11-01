// `pnpm webhook:replay`'s arguments (docs/specs/032-payment-webhooks,
// behavior 27–28, W1–W4). It posts only to this machine: the token in
// .env.local may be Production's, and a typo mustn't send events there
// (D13). Pure.

export const REPLAY_USAGE =
  "Usage: pnpm webhook:replay <ps-…> [--event completed|expired] [--url http://localhost:3000]"
export const LOCAL_ONLY = "webhook:replay only posts to localhost."

const SESSION_ID = /^ps-[0-9a-f]{24}$/
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"])

export type ReplayArgs =
  | {
      ok: true
      sessionId: string
      event: "payment_session.completed" | "payment_session.expired"
      // Where the event goes
      endpoint: string
    }
  | { ok: false; message: string }

export function parseReplayArgs(argv: readonly string[]): ReplayArgs {
  const usage = { ok: false, message: REPLAY_USAGE } as const
  let sessionId: string | undefined
  let event = "completed"
  let url = "http://localhost:3000"

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === "--event" || arg === "--url") {
      const value = argv[++i]
      if (value === undefined) return usage
      if (arg === "--event") event = value
      else url = value
    } else if (sessionId === undefined) {
      sessionId = arg
    } else {
      return usage
    }
  }

  if (!sessionId || !SESSION_ID.test(sessionId)) return usage
  if (event !== "completed" && event !== "expired") return usage

  let origin: URL
  try {
    origin = new URL(url)
  } catch {
    return { ok: false, message: LOCAL_ONLY }
  }
  if (origin.protocol !== "http:" || !LOCAL_HOSTS.has(origin.hostname)) {
    return { ok: false, message: LOCAL_ONLY }
  }

  return {
    ok: true,
    sessionId,
    event: `payment_session.${event}`,
    endpoint: `${origin.origin}/api/webhooks/xendit`,
  }
}

// A body in Xendit's session-webhook shape: only what the handler reads
export const replayBody = (
  event: string,
  sessionId: string,
  now = new Date()
) => ({
  event,
  business_id: "replay",
  created: now.toISOString(),
  data: {
    payment_session_id: sessionId,
    status: event === "payment_session.completed" ? "COMPLETED" : "EXPIRED",
  },
})
