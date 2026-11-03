import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { DevEmailList, type DevEmailRow } from "./dev-email-list"

// docs/specs/036-order-emails: V2, V4, V6 and V8 as markup.

const LINK =
  "http://localhost:3000/orders/PCS-7KQ2M9XD?sig=SIG&exp=1793000000&p=view"

const email = (
  n: number,
  overrides: Partial<DevEmailRow> = {}
): DevEmailRow => ({
  id: `fake_${n}`,
  from: "PC Silicon <orders@mail.pcsilicon.tech>",
  to: "ana@example.com",
  subject: `[Demo] Order PCS-7KQ2M9XD placed ${n}`,
  html: `<html><head></head><body><a href="${LINK}">Pay now</a></body></html>`,
  text: `Pay now ${LINK}`,
  // 2026-11-01T07:00:00Z is Sun 1 Nov 2026, 3:00 PM in Manila
  createdAt: new Date(Date.UTC(2026, 10, 1, 7, n)),
  ...overrides,
})

const render = (emails: DevEmailRow[]) =>
  renderToStaticMarkup(<DevEmailList emails={emails} />)

describe("the list of recorded emails", () => {
  it("V2: shows every email in the order given, with to, from and time in Manila", () => {
    const html = render([email(3), email(2), email(1)])

    const subjects = [...html.matchAll(/<h2[^>]*>([^<]*)<\/h2>/g)].map(
      (m) => m[1]
    )
    expect(subjects).toEqual([
      "[Demo] Order PCS-7KQ2M9XD placed 3",
      "[Demo] Order PCS-7KQ2M9XD placed 2",
      "[Demo] Order PCS-7KQ2M9XD placed 1",
    ])
    expect(html).toContain("ana@example.com")
    expect(html).toContain("PC Silicon &lt;orders@mail.pcsilicon.tech&gt;")
    expect(html).toContain("Sun 1 Nov 2026, 3:03 PM")
  })

  it("V2: each email's HTML sits in a frame, its text in a block with links", () => {
    const html = render([email(1)])

    expect(html.match(/<iframe/g)).toHaveLength(1)
    // The text version links its URL, to a new tab
    expect(html).toMatch(
      /<a href="http:\/\/localhost:3000\/orders\/PCS-7KQ2M9XD\?sig=SIG&amp;exp=1793000000&amp;p=view" target="_blank" rel="noopener noreferrer"/
    )
  })

  it("V4: says so when there are none", () => {
    expect(render([])).toBe('<p class="text-sm">No emails yet.</p>')
  })

  it("V8: the frame's sandbox allows popups and not scripts", () => {
    const html = render([email(1)])

    expect(html).toContain(
      'sandbox="allow-popups allow-popups-to-escape-sandbox"'
    )
    expect(html).not.toContain("allow-scripts")
    expect(html).not.toContain("allow-same-origin")
  })

  it("V6: a script in a stored email stays inside the frame's document", () => {
    const html = render([
      email(1, {
        html: '<html><head></head><body><script>alert("x")</script></body></html>',
      }),
    ])

    // It is data in an attribute (escaped), never markup on this page
    expect(html).not.toContain("<script>")
    expect(html).toContain("&lt;script&gt;")
  })
})
