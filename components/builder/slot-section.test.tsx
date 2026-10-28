import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, test } from "vitest"

import type { BuilderPartData } from "@/lib/build-state/parts"
import type { AnyBuildPart, Issue, Slot } from "@/lib/builder"
import type { StockStatus } from "@/lib/stock"
import { seed } from "@/test-support/seed-parts"

import { SlotSection, type SlotEntry, worstSeverity } from "./slot-section"

// A builder slot's markup (docs/specs/020-builder-page, Behavior 10–14)

function entry(
  part: AnyBuildPart,
  {
    price = 649_500,
    salePrice = null,
    stock = 25,
    stockStatus = "in-stock",
    quantity = 1,
  }: {
    price?: number
    salePrice?: number | null
    stock?: number
    stockStatus?: StockStatus
    quantity?: number
  } = {}
): SlotEntry {
  return {
    quantity,
    data: {
      part,
      slug: "the-part",
      brand: "Brand",
      price,
      salePrice,
      effectivePrice: salePrice ?? price,
      stock,
      stockStatus,
      image: null,
    } satisfies BuilderPartData,
  }
}

function render(
  slot: Slot,
  entries: SlotEntry[],
  { loading = false, issues = [] as Issue[] } = {}
) {
  return renderToStaticMarkup(
    <SlotSection
      slot={slot}
      entries={entries}
      loading={loading}
      issues={issues}
      onRemove={() => {}}
      onQuantity={() => {}}
      onOpenPicker={() => {}}
    />
  )
}

// The stepper's buttons, by label, and whether each is disabled
function stepper(html: string, name: string) {
  // Names like "32 GB (2×16 GB)" hold regex characters
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const button = (label: string) => {
    const match = html.match(
      new RegExp(
        `<button[^>]*aria-label="${label} quantity of ${escaped}"[^>]*>`
      )
    )
    expect(match, `${label} button`).not.toBeNull()
    return /\sdisabled(=""|\s|>)/.test(match![0])
  }
  return { decrease: button("Decrease"), increase: button("Increase") }
}

const vengeance = seed.vengeanceDdr5.name

describe("SlotSection", () => {
  // docs/specs/021-slot-picker, Behavior 1: buttons that open the picker
  test("an empty slot has a button that opens the picker (E1)", () => {
    const html = render("cpu", [])
    expect(html).toMatch(/<button[^>]*>Choose a CPU<\/button>/)
    expect(html).not.toContain('href="/cpu"')
    expect(html).toContain(">CPU</h2>")
  })

  test.each([
    ["motherboard", "Choose a motherboard"],
    ["memory", "Choose memory"],
    ["storage", "Choose storage"],
    ["gpu", "Choose a graphics card"],
    ["case", "Choose a case"],
    ["psu", "Choose a power supply"],
    ["cpu-cooler", "Choose a CPU cooler"],
  ] as const)("an empty %s slot says %s (E1)", (slot, choose) => {
    expect(render(slot, [])).toContain(choose)
  })

  test("loading shows a skeleton, not a button", () => {
    const html = render("cpu", [], { loading: true })
    expect(html).toContain('data-slot="skeleton"')
    expect(html).not.toContain("Choose a CPU")
  })

  test("a part shows its brand, linked name, price and stock (E2)", () => {
    const html = render("cpu", [entry(seed.ryzen5_7600, { price: 1_149_500 })])
    expect(html).toContain('href="/cpu/the-part"')
    expect(html).toContain(seed.ryzen5_7600.name)
    expect(html).toContain("₱11,495.00")
    expect(html).toContain("In stock")
    expect(html).toMatch(/<button[^>]*aria-label="Change CPU"/)
    expect(html).toContain('data-focus="change-cpu-100-100001015BOX"')
    expect(html).toContain(
      `aria-label="Remove ${seed.ryzen5_7600.name} from your build"`
    )
  })

  test("a part on sale shows the sale price and the old one struck through (E4)", () => {
    const html = render("cpu", [
      entry(seed.ryzen5_7600, { price: 1_249_500, salePrice: 1_099_500 }),
    ])
    expect(html).toContain("₱10,995.00")
    expect(html).toContain("<s>₱12,495.00</s>")
  })

  test.each([
    ["out-of-stock", "Out of stock"],
    ["pre-order", "Pre-order"],
  ] as const)(
    "a saved %s part stays, with a note (E7, E8)",
    (stockStatus, label) => {
      const html = render("gpu", [
        entry(seed.rtx5090Astral, { stockStatus, stock: 0 }),
      ])
      expect(html).toContain(label)
      expect(html).toContain(
        "Not available to buy right now. Replace it to add this build to cart."
      )
    }
  )

  test("low stock is buyable, so it has no note (E7)", () => {
    const html = render("cpu", [
      entry(seed.ryzen7_9800x3d, { stockStatus: "low-stock", stock: 4 }),
    ])
    expect(html).toContain("Low stock")
    expect(html).not.toContain("Not available to buy")
  })

  test("more than one unit shows the unit price and the line total (E12)", () => {
    const html = render("memory", [entry(seed.vengeanceDdr5, { quantity: 2 })])
    expect(html).toContain("₱6,495.00 × 2")
    expect(html).toContain("₱12,990.00")
  })

  test("at 1, only increasing is allowed, up to the stock (E14)", () => {
    expect(
      stepper(render("memory", [entry(seed.vengeanceDdr5)]), vengeance)
    ).toEqual({ decrease: true, increase: false })
    expect(
      stepper(
        render("memory", [entry(seed.vengeanceDdr5, { quantity: 25 })]),
        vengeance
      )
    ).toEqual({ decrease: false, increase: true })
  })

  test("a part that isn't buyable can't be increased (E15)", () => {
    const html = render("storage", [
      entry(seed.pro990, { stockStatus: "pre-order", stock: 14, quantity: 2 }),
    ])
    expect(stepper(html, seed.pro990.name)).toEqual({
      decrease: false,
      increase: true,
    })
  })

  test("a quantity above the stock is kept; only decreasing is allowed (E16)", () => {
    const html = render("memory", [
      entry(seed.vengeanceDdr5, { quantity: 30, stock: 25 }),
    ])
    expect(html).toContain("₱6,495.00 × 30")
    expect(stepper(html, vengeance)).toEqual({
      decrease: false,
      increase: true,
    })
  })

  test("one-part slots have no stepper", () => {
    expect(render("cpu", [entry(seed.ryzen5_7600)])).not.toContain(
      "quantity of"
    )
  })

  test("storage offers another drive, and a Change per drive (E17, D12)", () => {
    const html = render("storage", [entry(seed.pro990), entry(seed.mx500)])
    expect(html).toMatch(/<button[^>]*>Add another drive<\/button>/)
    expect(html).not.toContain('href="/storage"')
    expect(html).toContain(`aria-label="Change ${seed.pro990.name}"`)
    expect(html).toContain(
      `aria-label="Change ${seed.mx500.name.replaceAll('"', "&quot;")}"`
    )
  })

  test("a part named in an error is marked (E6)", () => {
    const issues: Issue[] = [
      {
        rule: "socket-match",
        severity: "error",
        parts: [
          { slot: "cpu", id: seed.ryzen5_7600.id },
          { slot: "motherboard", id: seed.proB760mDdr4.id },
        ],
        message: "",
      },
    ]
    const html = render("cpu", [entry(seed.ryzen5_7600)], { issues })
    expect(html).toContain(">Error<")
  })
})

describe("worstSeverity", () => {
  const issue = (severity: Issue["severity"], id: string): Issue => ({
    rule: "socket-match",
    severity,
    parts: [{ slot: "cpu", id }],
    message: "",
  })

  test("is null when no issue names the part", () => {
    expect(worstSeverity([issue("error", "other")], "cpu", "x")).toBeNull()
  })

  test("prefers an error over a warning", () => {
    expect(
      worstSeverity([issue("warning", "x"), issue("error", "x")], "cpu", "x")
    ).toBe("error")
  })

  test("is a warning when that's all there is (E5)", () => {
    expect(worstSeverity([issue("warning", "x")], "cpu", "x")).toBe("warning")
  })
})
