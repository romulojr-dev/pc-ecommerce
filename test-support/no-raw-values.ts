import { expect } from "vitest"

// The shared check behind "Demo never receives a customer's details"
// (docs/specs/040-admin-permissions-audit-masking, R19, D8). Give it what
// would be sent to the browser (a DTO, the props of a client component, the
// RSC payload text, the HTML) and the real values of the fixture; it fails if
// any of them appears. Each Admin screen story reuses it on its page's RSC
// payload.

export function expectNoRawValues(sent: unknown, rawValues: string[]): void {
  const text = typeof sent === "string" ? sent : JSON.stringify(sent)
  const lower = text.toLowerCase()
  for (const value of rawValues) {
    expect(value.length, "a fixture value to look for").toBeGreaterThan(0)
    expect(lower, `the output holds "${value}"`).not.toContain(
      value.toLowerCase()
    )
    // The same value in the other forms it can travel in
    const escaped = JSON.stringify(value).slice(1, -1).toLowerCase()
    expect(lower, `the output holds "${value}" (escaped)`).not.toContain(
      escaped
    )
    const url = encodeURIComponent(value).toLowerCase()
    expect(lower, `the output holds "${value}" (url-encoded)`).not.toContain(
      url
    )
  }
}

// What a fixture order holds, for the screen tests to hand to the helper
export const FIXTURE_CUSTOMER = {
  name: "Ana Reyes",
  email: "ana.reyes@example.com",
  mobile: "+639171234567",
  street: "12 Mabini St",
  note: "Call before delivery, gate 4",
} as const

export const FIXTURE_RAW_VALUES = [
  FIXTURE_CUSTOMER.name,
  "Reyes",
  FIXTURE_CUSTOMER.email,
  "example.com",
  FIXTURE_CUSTOMER.mobile,
  "9171234567",
  FIXTURE_CUSTOMER.street,
  "Mabini",
  FIXTURE_CUSTOMER.note,
]
