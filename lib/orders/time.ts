// Times on an order, always in Philippine time (docs/specs/030-place-an-order,
// §4 The order page, D16). Servers run in UTC, so the zone is fixed, as
// manilaToday's is (lib/stock.ts): one module-level formatter and pure
// functions of a Date. The text is put together from the formatter's parts so
// a newer ICU's punctuation can't change it.

const parts = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Manila",
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
})

function read(date: Date) {
  const found: Record<string, string> = {}
  for (const { type, value } of parts.formatToParts(date)) found[type] = value
  return found
}

// "Sun 1 Nov 2026"
export function dateText(date: Date): string {
  const p = read(date)
  return `${p.weekday} ${p.day} ${p.month} ${p.year}`
}

// "Sun 1 Nov 2026, 3:42 PM" (midnight is 12:00 AM, noon 12:00 PM)
export function dateTimeText(date: Date): string {
  const p = read(date)
  const period = p.dayPeriod.toUpperCase().replace(/\./g, "")
  return `${dateText(date)}, ${p.hour}:${p.minute} ${period}`
}

export const payByText = (expiresAt: Date): string =>
  `Pay by ${dateTimeText(expiresAt)}`

export const placedOnText = (createdAt: Date): string =>
  `Placed on ${dateText(createdAt)}`

// Whether the payment time has passed: instants are compared, never text
export const isPastDue = (expiresAt: Date, now: Date): boolean =>
  now.getTime() >= expiresAt.getTime()
