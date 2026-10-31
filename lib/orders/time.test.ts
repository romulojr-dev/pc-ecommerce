import { afterEach, describe, expect, it } from "vitest"

import { dateText, isPastDue, payByText, placedOnText } from "./time"

// docs/specs/030-place-an-order: V16–V16e. The formatter fixes the zone, so
// the text must not depend on the machine's: every case runs under two.

const original = process.env.TZ
afterEach(() => {
  if (original === undefined) delete process.env.TZ
  else process.env.TZ = original
})

const CASES: [name: string, iso: string, pay: string, placed?: string][] = [
  [
    "V16: 3:42 PM the next day",
    "2026-11-01T07:42:00Z",
    "Pay by Sun 1 Nov 2026, 3:42 PM",
  ],
  [
    "V16b: crosses midnight in Manila (the UTC date is still 1 Nov)",
    "2026-11-01T17:30:00Z",
    "Pay by Mon 2 Nov 2026, 1:30 AM",
  ],
  [
    "V16c: midnight reads 12:00 AM",
    "2026-11-01T16:00:00Z",
    "Pay by Mon 2 Nov 2026, 12:00 AM",
  ],
  [
    "V16c: a minute before",
    "2026-11-01T15:59:00Z",
    "Pay by Sun 1 Nov 2026, 11:59 PM",
  ],
  [
    "noon reads 12:00 PM",
    "2026-11-01T04:00:00Z",
    "Pay by Sun 1 Nov 2026, 12:00 PM",
  ],
  [
    "V16d: month and year roll over in Manila, not in UTC",
    "2026-12-31T20:00:00Z",
    "Pay by Fri 1 Jan 2027, 4:00 AM",
  ],
]

describe.each(["UTC", "America/Los_Angeles", "Asia/Manila"])(
  "payByText under TZ=%s",
  (zone) => {
    it.each(CASES)("%s", (_name, iso, pay) => {
      process.env.TZ = zone
      expect(payByText(new Date(iso))).toBe(pay)
    })

    it("V16b: 'Placed on' for the same order reads Sun 1 Nov 2026", () => {
      process.env.TZ = zone
      // Placed 2026-10-31T17:30Z, which is 1:30 AM on Sunday 1 Nov in Manila
      expect(placedOnText(new Date("2026-10-31T17:30:00Z"))).toBe(
        "Placed on Sun 1 Nov 2026"
      )
      expect(dateText(new Date("2026-10-31T17:30:00Z"))).toBe("Sun 1 Nov 2026")
    })
  }
)

describe("isPastDue (V16e)", () => {
  const expires = new Date("2026-11-01T17:30:00Z")

  it("compares instants: showing before the deadline, past due at it", () => {
    for (const zone of ["UTC", "America/Los_Angeles"]) {
      process.env.TZ = zone
      expect(isPastDue(expires, new Date(expires.getTime() - 1000))).toBe(false)
      expect(isPastDue(expires, expires)).toBe(true)
      expect(isPastDue(expires, new Date(expires.getTime() + 1000))).toBe(true)
    }
  })
})
