import type { StartResult } from "./start-payment"

// When another start of the same order is opening a session, the page waits
// for it and asks again (docs/specs/034-start-payment-outside-transaction,
// behavior 6 and 8): once a second, for up to 30 s after the click. The next
// answer that isn't "opening" is the result; still opening at the end is an
// error. Runs in the browser; the clock and the sleep are injectable for
// tests.

export const OPENING_RETRY_MS = 1_000
export const OPENING_WAIT_MS = 30_000

const ERROR: StartResult = { ok: false, reason: "error" }

export type WaitOptions = {
  // The first ask was already made and answered "opening" (Place order's
  // payment step)
  skipFirst?: boolean
  sleep?: (ms: number) => Promise<void>
  now?: () => number
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms))

const isOpening = (result: StartResult) =>
  !result.ok && result.reason === "opening"

export async function waitForSession(
  start: () => Promise<StartResult>,
  { skipFirst = false, sleep = defaultSleep, now = Date.now }: WaitOptions = {}
): Promise<StartResult> {
  const began = now()
  // No answer (a network failure) is an error, as Pay now treats it
  const ask = () => start().catch(() => ERROR)

  if (!skipFirst) {
    const first = await ask()
    if (!isOpening(first)) return first
  }
  for (;;) {
    await sleep(OPENING_RETRY_MS)
    if (now() - began >= OPENING_WAIT_MS) return ERROR
    const next = await ask()
    if (!isOpening(next)) return next
  }
}
