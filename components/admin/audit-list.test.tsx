import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { DEFAULT_AUDIT_PARAMS } from "@/lib/admin/audit-params"
import type { AuditEntryView, AuditPage } from "@/lib/admin/queries/audit"

import { AuditFilters } from "./audit-filters"
import { AuditListView } from "./audit-list"

// docs/specs/047-admin-audit-log-view: B4 to B10, E1, E12, E18, E19 as markup

const entry = (over: Partial<AuditEntryView> = {}): AuditEntryView => ({
  id: "a1",
  entity: "product",
  action: "updated",
  actor: { name: "Ana Owner", role: "Owner" },
  createdAt: new Date("2026-11-05T15:30:00Z"),
  target: { label: "Ryzen 5 7600 (CPU-1)", href: "/admin/products/p1" },
  changes: [
    {
      path: "price",
      label: "Price",
      before: "₱12,999.00",
      after: "₱11,999.00",
      looksUnchanged: false,
    },
  ],
  ...over,
})

const page = (
  entries: AuditEntryView[],
  over: Partial<AuditPage> = {}
): AuditPage => ({
  entries,
  total: entries.length,
  page: 1,
  pageCount: 1,
  actors: [],
  unknownActor: false,
  ...over,
})

const html = (
  data: AuditPage,
  params = DEFAULT_AUDIT_PARAMS,
  extra: { demo?: boolean; rangeCleared?: boolean } = {}
) =>
  renderToStaticMarkup(
    <AuditListView
      data={data}
      params={params}
      demo={extra.demo ?? false}
      rangeCleared={extra.rangeCleared ?? false}
    />
  )

describe("AuditListView", () => {
  it("E12: a row has who, what, a link, and a diff inside a details", () => {
    const out = html(page([entry()]))
    expect(out).toContain("Ana Owner (Owner)")
    expect(out).toContain("Product · Updated")
    expect(out).toContain('href="/admin/products/p1"')
    expect(out).toContain("<details>")
    expect(out).toContain("Show changes")
    expect(out).toContain("₱12,999.00")
    expect(out).toContain("₱11,999.00")
    expect(out).toContain("1 change")
    // Philippine time
    expect(out).toContain("11:30 PM")
  })

  it("never draws raw JSON", () => {
    const out = html(page([entry()]))
    expect(out).not.toContain("{&quot;")
    expect(out).not.toContain('{"')
  })

  it("E19: an entity with no screen is plain text", () => {
    const out = html(
      page([entry({ entity: "voucher", target: { label: "v1", href: null } })])
    )
    expect(out).toContain("Voucher · Updated")
    expect(out).toContain(">v1<")
    expect(out).not.toContain('href="/admin/vouchers')
  })

  it("an entry with nothing to compare says so", () => {
    const out = html(page([entry({ changes: [] })]))
    expect(out).toContain("No field changes were recorded.")
  })

  it("E18: a Demo row that reads the same shows the Changed badge, and the note", () => {
    const out = html(
      page([
        entry({
          changes: [
            {
              path: "contactName",
              label: "Contact name",
              before: "A••• R•••",
              after: "A••• R•••",
              looksUnchanged: true,
            },
          ],
        }),
      ]),
      DEFAULT_AUDIT_PARAMS,
      { demo: true }
    )
    expect(out).toContain("Changed")
    expect(out).toContain("Customer details are hidden in the demo.")
  })

  it("E11 and the empty states: filtered and not", () => {
    expect(html(page([]))).toContain("No changes recorded yet.")
    const filtered = html(page([]), {
      ...DEFAULT_AUDIT_PARAMS,
      entity: "order",
    })
    expect(filtered).toContain("No changes match these filters.")
    expect(filtered).toContain("Clear filters")
  })

  it("E8: says the dates were cleared", () => {
    expect(
      html(page([entry()]), DEFAULT_AUDIT_PARAMS, { rangeCleared: true })
    ).toContain(
      "The start date was after the end date, so the dates were cleared."
    )
  })

  it("E1: previous and next keep the filters", () => {
    const out = html(page([entry()], { page: 2, pageCount: 3, total: 60 }), {
      ...DEFAULT_AUDIT_PARAMS,
      entity: "order",
      page: 2,
    })
    expect(out).toContain("Page 2 of 3")
    expect(out).toContain('href="/admin/audit?entity=order"')
    expect(out).toContain('href="/admin/audit?entity=order&amp;page=3"')
  })
})

describe("AuditFilters", () => {
  it("is a GET form with labelled controls and Philippine-time dates", () => {
    const out = renderToStaticMarkup(
      <AuditFilters
        params={{ ...DEFAULT_AUDIT_PARAMS, from: "2026-11-01" }}
        actors={[{ id: "u1", name: "Mara", role: "Staff" }]}
        resultsId="audit-results"
      />
    )
    expect(out).toContain('method="get"')
    expect(out).toContain("Mara (Staff)")
    expect(out).toContain("From (Philippine time)")
    expect(out).toContain('value="2026-11-01"')
    expect(out).toContain("Clear filters")
    expect(out).toContain("Shipping rate")
  })
})
