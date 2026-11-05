import { describe, expect, test } from "vitest"

import {
  addressView,
  auditEntryView,
  contactView,
  maskAuditJson,
  maskEmail,
  maskFreeText,
  maskMobile,
  maskName,
  maskTracking,
  parcelView,
  type RawAddress,
} from "./mask"

// docs/specs/040-admin-permissions-audit-masking, T9: E11, E12, E15

const RAW = {
  guestEmail: "ana.reyes@example.com",
  contactName: "Ana Reyes",
  contactMobile: "+639171234567",
}

const DELIVERY: RawAddress = {
  fulfillment: "DELIVERY",
  regionName: "National Capital Region (NCR)",
  zone: "METRO_MANILA",
  provinceName: "Metro Manila",
  cityName: "Quezon City",
  barangayName: "Alicia",
  street: "12 Mabini St",
  zip: "1100",
}

describe("the mask formats", () => {
  test("names: first letters plus fixed bullets", () => {
    expect(maskName("Ana Reyes")).toBe("A••• R•••")
    expect(maskName("  Juan   dela  Cruz ")).toBe("J••• d••• C•••")
    expect(maskName("")).toBe("•••")
    // Same shape whatever the real length
    expect(maskName("Ana")).toBe(maskName("Anastasia"))
  })

  test("emails: first letter, fixed shape, no domain", () => {
    expect(maskEmail("ana.reyes@example.com")).toBe("a•••@••••.•••")
    expect(maskEmail("a@b.co")).toBe(maskEmail("alexander@longdomain.example"))
    expect(maskEmail("")).toBe("•••@••••.•••")
  })

  test("mobiles: only the country code", () => {
    expect(maskMobile("+639171234567")).toBe("+63•••••••••")
  })

  test("free text", () => {
    expect(maskFreeText("Call before delivery, gate 4")).toBe("Hidden in demo")
  })
})

describe("contactView", () => {
  test("Owner and Staff see the real values", () => {
    for (const role of ["owner", "staff"] as const) {
      expect(contactView(role, RAW)).toEqual({
        masked: false,
        name: "Ana Reyes",
        email: "ana.reyes@example.com",
        mobile: "+639171234567",
      })
    }
  })

  test("Demo sees masks and the view holds no real value (E11)", () => {
    const view = contactView("demo", RAW)
    expect(view).toEqual({
      masked: true,
      name: "A••• R•••",
      email: "a•••@••••.•••",
      mobile: "+63•••••••••",
    })
    const text = JSON.stringify(view)
    for (const secret of [
      "Ana Reyes",
      "ana.reyes",
      "example.com",
      "9171234567",
    ])
      expect(text).not.toContain(secret)
  })
})

describe("addressView", () => {
  test("Owner and Staff see the whole address", () => {
    expect(addressView("staff", DELIVERY)).toMatchObject({
      masked: false,
      street: "12 Mabini St",
      zip: "1100",
      cityName: "Quezon City",
    })
  })

  test("Demo keeps the region and the zone only (E11)", () => {
    const view = addressView("demo", DELIVERY)
    expect(view).toEqual({
      kind: "delivery",
      masked: true,
      regionName: "National Capital Region (NCR)",
      zone: "METRO_MANILA",
    })
    const text = JSON.stringify(view)
    for (const secret of ["Mabini", "1100", "Quezon", "Alicia", "Metro Manila"])
      expect(text).not.toContain(secret)
  })

  test("a pickup order is pickup for every role (E12)", () => {
    const pickup: RawAddress = {
      ...DELIVERY,
      fulfillment: "PICKUP",
      regionName: null,
      zone: null,
      street: null,
      zip: null,
      cityName: null,
      barangayName: null,
      provinceName: null,
    }
    for (const role of ["owner", "staff", "demo"] as const)
      expect(addressView(role, pickup)).toEqual({ kind: "pickup" })
  })
})

describe("audit entries", () => {
  test("customer keys are masked, free text hidden, others kept (E15)", () => {
    expect(
      maskAuditJson({
        contactMobile: "+639171234567",
        note: "Leave with guard",
        status: "PROCESSING",
        nested: { guestEmail: "ana.reyes@example.com", street: "12 Mabini St" },
        list: [{ comment: "hi", price: 100 }],
      })
    ).toEqual({
      contactMobile: "+63•••••••••",
      note: "Hidden in demo",
      status: "PROCESSING",
      nested: { guestEmail: "a•••@••••.•••", street: "Hidden in demo" },
      list: [{ comment: "Hidden in demo", price: 100 }],
    })
  })

  test("a non-string free-text value is hidden too", () => {
    expect(maskAuditJson({ notes: ["a", "b"] })).toEqual({
      notes: "Hidden in demo",
    })
  })

  const entry = {
    id: "a1",
    entity: "order",
    entityId: "o1",
    action: "updated",
    actor: { name: "Ana Owner", role: "OWNER" },
    before: { contactMobile: "+639171234567" },
    after: { contactMobile: "+639179999999", note: "x" },
    createdAt: new Date("2026-11-05T00:00:00Z"),
  }

  test("Demo gets masked before and after; Owner gets them as they are", () => {
    expect(auditEntryView("demo", entry)).toMatchObject({
      before: { contactMobile: "+63•••••••••" },
      after: { contactMobile: "+63•••••••••", note: "Hidden in demo" },
    })
    expect(auditEntryView("owner", entry)).toBe(entry)
  })
})

// docs/specs/043-order-fulfillment-transitions: E30a, E30b
describe("tracking numbers", () => {
  test("E30b: 8 or more characters show bullets and the last four", () => {
    expect(maskTracking("123456784821")).toBe("•••• 4821")
    expect(maskTracking("ABCD1234")).toBe("•••• 1234")
    expect(maskTracking(" 12345678 ")).toBe("•••• 5678")
  })

  test("E30b: under 8 characters show only bullets, never the whole number", () => {
    for (const short of ["1234", "ABC1234", "12345"]) {
      expect(maskTracking(short)).toBe("••••")
    }
  })

  test("the parcel: Owner and Staff see both, Demo sees the courier and a masked number", () => {
    const raw = { courier: "LBC", trackingNumber: "123456784821" }
    for (const role of ["owner", "staff"] as const) {
      expect(parcelView(role, raw)).toEqual({ masked: false, ...raw })
    }
    expect(parcelView("demo", raw)).toEqual({
      masked: true,
      courier: "LBC",
      trackingNumber: "•••• 4821",
    })
  })

  test("no parcel until it ships", () => {
    expect(parcelView("owner", { courier: null, trackingNumber: null })).toBe(
      null
    )
    expect(parcelView("demo", { courier: "LBC", trackingNumber: null })).toBe(
      null
    )
  })

  test("E30b: an audit entry's trackingNumber is masked for Demo", () => {
    expect(
      maskAuditJson({
        status: "SHIPPED",
        courier: "LBC",
        trackingNumber: "123456784821",
      })
    ).toEqual({
      status: "SHIPPED",
      courier: "LBC",
      trackingNumber: "•••• 4821",
    })
  })
})
