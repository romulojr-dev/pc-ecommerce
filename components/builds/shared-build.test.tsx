import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, test } from "vitest"

import { sharedBuildView } from "@/lib/build-state/shared"
import { buildA, nb, seed } from "@/test-support/seed-parts"
import { partsOf, snapshot } from "@/test-support/shared-snapshot"

import { SharedBuild } from "./shared-build"

// The shared page's markup (docs/specs/022-share-build, Behavior 12–17;
// Shared page examples E24–E33), from the real view of seed builds

const A = partsOf(buildA())

const render = (
  parts = A,
  options: Parameters<typeof snapshot>[1] = {},
  children?: React.ReactNode
) =>
  renderToStaticMarkup(
    <SharedBuild view={sharedBuildView(snapshot(parts, options))}>
      {children}
    </SharedBuild>
  )

const text = (html: string) => html.replace(/<[^>]+>/g, " ")

describe("SharedBuild", () => {
  test("shows build A's eight slots in order, read-only (E24)", () => {
    const html = render()
    const headings = [
      "CPU",
      "Motherboard",
      "Memory",
      "Storage",
      "Graphics Card",
      "Case",
      "Power Supply",
      "CPU Cooler",
    ].map((name) => html.indexOf(`>${name}</h2>`))
    expect(headings.every((position) => position > -1)).toBe(true)
    expect([...headings].sort((a, b) => a - b)).toEqual(headings)

    expect(html).toContain("AMD Ryzen 5 7600")
    expect(html).toContain("₱11,495.00")
    expect(html).toContain("₱69,060.00")
    expect(html).toContain(
      `Estimated power: ${nb("264 W")} of ${nb("550 W")} (48%)`
    )
    expect(text(html)).toContain("OK")
    expect(html).toContain("No compatibility issues found.")
    expect(html).not.toContain("No part chosen")
  })

  test("has none of the builder's controls (E24)", () => {
    const html = render()
    for (const control of [
      "Remove",
      "Change",
      "Choose",
      "Add another drive",
      "Add build to cart",
      "Increase quantity",
    ]) {
      expect(html).not.toContain(control)
    }
    // The only button is the power estimate's tooltip trigger
    const buttons = html.match(/<button[^>]*>/g) ?? []
    expect(buttons).toHaveLength(1)
    expect(buttons[0]).toContain('aria-label="How is this estimated?"')
  })

  test("links each part to its page (E24)", () => {
    expect(render()).toContain('href="/cpu/100-100001015BOX"')
  })

  test("says No part chosen for the empty slots (E25)", () => {
    const html = render([seed.ryzen5_7600])
    expect(html.match(/No part chosen/g)).toHaveLength(7)
  })

  test("marks the parts an error names, and lists the message (E25)", () => {
    const html = render([seed.ryzen5_7600, seed.proB760mDdr4])
    expect(text(html)).toContain("Errors")
    expect(html).toContain(
      "The AMD Ryzen 5 7600 (AM5) doesn&#x27;t fit the LGA1700 socket on the MSI PRO B760M-A WiFi DDR4."
    )
    expect(html.match(/>Error</g)!.length).toBeGreaterThanOrEqual(3)
  })

  test("notes a part that can't be bought now, and says so in the summary (E26)", () => {
    const html = render(
      [seed.ryzen7_9800x3d, seed.rtx5090Astral, seed.rm850e],
      {
        status: {
          [seed.ryzen7_9800x3d.id]: "low-stock",
          [seed.rtx5090Astral.id]: "out-of-stock",
        },
      }
    )
    expect(html).toContain("Out of stock")
    expect(html).toContain("Low stock")
    // Once on the row, once in the summary; low stock isn't flagged
    expect(html.match(/Not available to buy right now\./g)).toHaveLength(1)
    expect(html).toContain(
      "The ASUS ROG Astral GeForce RTX 5090 OC Edition 32GB isn&#x27;t available to buy right now."
    )
    expect(html).toContain("₱217,485.00")
  })

  test("lists a part that is no longer sold by name, without a price or link (E28)", () => {
    const html = render(A, { retired: [seed.rtx4060] })
    expect(html).toContain(seed.rtx4060.name)
    expect(html).toContain("No longer sold")
    expect(html).toContain(
      "This part isn’t sold anymore, so the total and the checks leave it out."
    )
    expect(html).not.toContain(`/gpu/${seed.rtx4060.id}`)
    expect(html).toContain("₱51,065.00")
  })

  test("says the build is incomplete, never OK, with a banner (E28)", () => {
    const html = render(A, { retired: [seed.rtx4060] })
    expect(html).toContain(
      "1 part is no longer sold, so the total and checks leave it out."
    )
    expect(text(html)).toContain("Incomplete")
    expect(html).not.toMatch(/>\s*OK\s*</)
    expect(html.indexOf("1 part is no longer sold")).toBeLessThan(
      html.indexOf(">CPU</h2>")
    )
  })

  test("counts several parts in the banner (E30b)", () => {
    const html = render(A, { retired: [seed.rtx4060, seed.pro990] })
    expect(html).toContain(
      "2 parts are no longer sold, so the total and checks leave them out."
    )
  })

  test("has no banner when every part is sold (E24)", () => {
    expect(render()).not.toContain("no longer sold")
  })

  test("shows no issues line when nothing was checked (E30)", () => {
    const html = render([seed.ryzen5_7600], { retired: [seed.ryzen5_7600] })
    expect(text(html)).toContain("Incomplete")
    expect(html).not.toContain("No compatibility issues found.")
    expect(html).toContain("₱0.00")
  })

  test("shows a quantity and its line total (E32)", () => {
    const html = render(A, { quantity: { [seed.vengeanceDdr5.id]: 2 } })
    expect(html).toContain("₱6,495.00 × 2")
    expect(html).toContain("₱12,990.00")
    expect(html).toContain("₱75,555.00")
  })

  test("lists drives by name (E33)", () => {
    const html = render([seed.pro990, seed.mx500])
    expect(html.indexOf(seed.mx500.name)).toBeLessThan(
      html.indexOf(seed.pro990.name)
    )
  })

  test("puts what it is given at the end of the summary", () => {
    const html = render(A, {}, <span>Open in builder</span>)
    expect(html).toContain("Open in builder")
    expect(html.lastIndexOf("Open in builder")).toBeGreaterThan(
      html.indexOf("Estimated power")
    )
  })
})
