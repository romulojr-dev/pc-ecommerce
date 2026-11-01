import { isSlow, POLL_UNTIL_MS, pollDelay } from "./poll"

// The return page's polling, without React (docs/specs/031-pay-with-xendit,
// Behavior 7–8, T1–T4): ask for the order's status on pollDelay's schedule,
// stop at the first status other than Pending payment, and pause while the
// tab is hidden. The 10-minute limit counts from the start, hidden time
// included. A failed request is tried again at the next tick, with no
// message.

export type StatusPollerOptions = {
  // The order's status, or null when the request failed
  fetchStatus: () => Promise<string | null>
  // The order left Pending payment
  onSettled: (status: string) => void
  // The first minute has passed: "Still confirming"
  onSlow: () => void
  isHidden: () => boolean
  now?: () => number
}

export type StatusPoller = {
  // The tab became visible or hidden
  visibilityChanged: () => void
  stop: () => void
}

export function startStatusPoller({
  fetchStatus,
  onSettled,
  onSlow,
  isHidden,
  now = Date.now,
}: StatusPollerOptions): StatusPoller {
  const start = now()
  let timer: ReturnType<typeof setTimeout> | undefined
  let stopped = false
  let slow = false

  const elapsed = () => now() - start

  function markSlow() {
    if (!slow && isSlow(elapsed())) {
      slow = true
      onSlow()
    }
  }

  function schedule() {
    markSlow()
    if (stopped || isHidden()) return
    const delay = pollDelay(elapsed())
    if (delay === null) {
      stopped = true
      return
    }
    timer = setTimeout(poll, delay)
  }

  async function poll() {
    timer = undefined
    if (stopped) return
    const status = await fetchStatus().catch(() => null)
    if (stopped) return
    if (status !== null && status !== "PENDING_PAYMENT") {
      stopped = true
      onSettled(status)
      return
    }
    schedule()
  }

  schedule()

  return {
    visibilityChanged() {
      if (stopped) return
      if (isHidden()) {
        clearTimeout(timer)
        timer = undefined
      } else if (timer === undefined) {
        // Back in view: ask once now, unless the time is up
        if (elapsed() >= POLL_UNTIL_MS) {
          stopped = true
          return
        }
        markSlow()
        void poll()
      }
    },
    stop() {
      stopped = true
      clearTimeout(timer)
    },
  }
}
