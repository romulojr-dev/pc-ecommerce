import { config } from "dotenv"

import { parseReplayArgs, replayBody } from "./webhook-replay-args"

// `pnpm webhook:replay <ps-…> [--event completed|expired] [--url …]`: sends a
// Xendit-format session webhook with the verification token from .env.local
// to a local server (docs/specs/032-payment-webhooks, behavior 27–29). The
// handler asks the gateway what happened, so a replay only marks Paid when
// the gateway agrees: a fake session paid on the test page, or a real one paid
// on Xendit's test page with a tunnel origin.
//
// It prints the HTTP status only, never the token or the body.
config({ path: ".env.local", quiet: true })

const args = parseReplayArgs(process.argv.slice(2))
if (!args.ok) {
  console.error(args.message)
  process.exit(1)
}

const token = process.env.XENDIT_WEBHOOK_TOKEN
if (!token) {
  console.error("XENDIT_WEBHOOK_TOKEN is not set in .env.local.")
  process.exit(1)
}

const response = await fetch(args.endpoint, {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-callback-token": token },
  body: JSON.stringify(replayBody(args.event, args.sessionId)),
  signal: AbortSignal.timeout(15_000),
})
console.log(`${response.status} ${response.statusText}`)
