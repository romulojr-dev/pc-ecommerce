// Asia/Manila calendar days as instants (docs/specs/047-admin-audit-log-view,
// Behavior 5, R3, D5). Manila is UTC+8 all year (no DST), so a day starts at
// 16:00 UTC of the day before. Pure.

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/
const EIGHT_HOURS = 8 * 60 * 60 * 1000

// The `YYYY-MM-DD` text of a real calendar day, or null
export function parseManilaDay(text: string): string | null {
  const m = DAY.exec(text)
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const probe = new Date(Date.UTC(y, mo - 1, d))
  const real =
    probe.getUTCFullYear() === y &&
    probe.getUTCMonth() === mo - 1 &&
    probe.getUTCDate() === d
  return real ? text : null
}

// 00:00 Asia/Manila of the day, as an instant
export function startOfManilaDay(day: string): Date {
  const [y, m, d] = day.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d) - EIGHT_HOURS)
}

// 00:00 Asia/Manila of the day after
export function startOfNextManilaDay(day: string): Date {
  const [y, m, d] = day.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d + 1) - EIGHT_HOURS)
}

// Both days are inclusive: `gte` the start of From, `lt` the start of the day
// after To ("before 00:00 Asia/Manila on the next day"), never "23:59:59.999"
export function manilaDayRange(
  from: string,
  to: string
): { gte?: Date; lt?: Date } {
  return {
    ...(from ? { gte: startOfManilaDay(from) } : {}),
    ...(to ? { lt: startOfNextManilaDay(to) } : {}),
  }
}
