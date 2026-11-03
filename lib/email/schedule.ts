import { after } from "next/server"

import { sendEmail } from "./send"

// The writer's trigger (docs/specs/035-email-foundation-signed-links,
// Behavior 2): once the transaction that enqueued the row has committed, ask
// for its send with `after()`, so the response never waits for it. If the
// function freezes first, the sweeps and the daily cron pick the row up.
//
// `after()` only works inside a request, so outside one (a test, a script)
// this does nothing: those call the sender directly. It never throws, so it
// can never fail the writer.
export function scheduleEmailSend(id: string): void {
  try {
    after(() => sendEmail(id).then(() => undefined))
  } catch {
    // Not in a request: the sweep will send it
  }
}
