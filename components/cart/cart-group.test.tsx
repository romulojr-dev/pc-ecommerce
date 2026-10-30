import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, test } from "vitest"

import { sharedBuildView } from "@/lib/build-state/shared"
import type { AnyBuildPart } from "@/lib/builder"
import { groupPartFlags, type ProductFlag } from "@/lib/cart/flags"
import type { CartGroupView, CartLineView, CartView } from "@/lib/cart/types"
import {
  partsOf,
  snapshot,
  type SnapshotOptions,
} from "@/test-support/shared-snapshot"
import { buildA, buildB, seed } from "@/test-support/seed-parts"

import { CartBody } from "./cart-body"
import { CartGroup } from "./cart-group"

// docs/specs/026-add-build-to-cart, Behavior 12–19, E32–E38: markup checks
// without a DOM, from the real engine's output for seed builds

function groupOf(
  parts: AnyBuildPart[],
  options: SnapshotOptions = {},
  number: number | null = null
): CartGroupView {
  const view = sharedBuildView(snapshot(parts, options))
  const slots = view.slots.filter(({ rows }) => rows.length > 0)
  return {
    kind: "build",
    buildId: "b1",
    slug: "k3x9m2q7ab",
    number,
    partCount: slots.reduce((sum, { rows }) => sum + rows.length, 0),
    total: view.total,
    status: view.status,
    issues: view.issues,
    slots,
    flags: groupPartFlags(slots, new Map()),
  }
}

const render = (
  group: CartGroupView,
  props: Partial<Parameters<typeof CartGroup>[0]> = {}
) =>
  renderToStaticMarkup(
    <CartGroup
      group={group}
      busy={false}
      message={null}
      onRemove={() => {}}
      {...props}
    />
  )

const isDisabled = (tag: string) => /\sdisabled(=""|[\s>])/.test(tag)
const buildAParts = () => partsOf(buildA())

describe("a group, collapsed (E32)", () => {
  const html = render(groupOf(buildAParts()))

  test("is one line: the label, the total and the status", () => {
    expect(html).toContain("Custom PC build · 8 parts")
    expect(html).toContain("₱69,060.00")
    expect(html).toContain("Compatibility:")
    expect(html).toMatch(/>\s*OK\s*</)
  })

  test("offers Show parts, View build and Remove", () => {
    expect(html).toMatch(/<button[^>]*aria-expanded="false"[^>]*>Show parts</)
    expect(html).toMatch(
      /<a [^>]*href="\/builds\/k3x9m2q7ab"[^>]*>View build<\/a>/
    )
    expect(html).toContain('aria-label="Remove Custom PC build"')
  })

  test("doesn't list the parts until it is opened", () => {
    expect(html).not.toContain(seed.ryzen5_7600.name)
    expect(html).toMatch(/<div id="[^"]+" hidden=""/)
  })
})

describe("a group, expanded (E32, E33)", () => {
  const html = render(groupOf(buildAParts()), { defaultExpanded: true })

  test("lists the parts in builder slot order", () => {
    const at = (name: string) => html.indexOf(name)
    const names = [
      seed.ryzen5_7600,
      seed.strixB650a,
      seed.vengeanceDdr5,
      seed.pro990,
      seed.rtx4060,
      seed.lancool216,
      seed.mwe550,
      seed.peerless,
    ].map((part) => at(part.name))
    expect(names.every((index) => index > -1)).toBe(true)
    expect(names).toEqual([...names].sort((a, b) => a - b))
  })

  test("says Hide parts", () => {
    expect(html).toMatch(/<button[^>]*aria-expanded="true"[^>]*>Hide parts</)
  })

  test("shows each part's category, price and stock", () => {
    expect(html).toContain(">CPU<")
    expect(html).toContain(">Motherboard<")
    expect(html).toContain("₱11,495.00")
    expect(html).toContain("In stock")
    expect(html).toMatch(/<a [^>]*href="\/cpu\/[^"]+"[^>]*>AMD Ryzen 5 7600</)
  })

  test("parts have no stepper and no Remove: only the group does", () => {
    expect(html).not.toContain("Quantity of")
    expect(html).not.toContain("Increase quantity")
    expect(html.match(/>Remove</g)).toHaveLength(1)
  })

  test("E33: a kit × 2 shows its quantity and line total", () => {
    const kit = render(
      groupOf(buildAParts(), { quantity: { [seed.vengeanceDdr5.id]: 2 } }),
      { defaultExpanded: true }
    )
    expect(kit).toContain("× 2")
    expect(kit).toContain("₱12,990.00")
    expect(kit).toContain("₱75,555.00")
    expect(kit).toContain("Custom PC build · 8 parts")
  })

  test("a clean build has no issue list", () => {
    expect(html).not.toContain("No compatibility issues found.")
  })
})

describe("a group with warnings (E34)", () => {
  const group = groupOf(partsOf(buildB()))

  test("reads Warnings, and the message follows the parts when opened", () => {
    expect(render(group)).toContain("Warnings")
    expect(render(group, { defaultExpanded: true })).toContain(
      "may need a BIOS update"
    )
  })
})

describe("a group with a part that is no longer sold (E37)", () => {
  const group = groupOf(buildAParts(), { retired: [seed.lancool216] })

  test("reads Incomplete and leaves the part out of the total", () => {
    const html = render(group)
    expect(html).toContain("Incomplete")
    expect(html).toContain("₱63,265.00")
    expect(html).toContain("Custom PC build · 8 parts")
  })

  test("lists the part by name with nothing to buy, and says so", () => {
    const html = render(group, { defaultExpanded: true })
    expect(html).toContain(seed.lancool216.name)
    expect(html).toContain("No longer sold")
    expect(html).toContain(
      "1 part is no longer sold, so the total and checks leave it out."
    )
    expect(html).not.toMatch(new RegExp(`<a [^>]*>${seed.lancool216.name}</a>`))
  })
})

describe("a part that is out of stock (E38)", () => {
  test("says so, and the status and total are unchanged", () => {
    const group = groupOf(buildAParts(), {
      status: { [seed.rtx4060.id]: "out-of-stock" },
    })
    const html = render(group, { defaultExpanded: true })
    expect(html).toContain("Out of stock")
    expect(html).toContain("₱69,060.00")
    expect(html).not.toContain("Incomplete")
  })
})

describe("numbered groups (E36)", () => {
  const html = render(groupOf(buildAParts(), {}, 2))

  test("carry their number in the label and the button names", () => {
    expect(html).toContain("Custom PC build 2 · 8 parts")
    expect(html).toContain('aria-label="Remove Custom PC build 2"')
    expect(html).toContain('aria-label="View build: Custom PC build 2"')
  })
})

describe("while a change is running, and after it fails", () => {
  test("Remove is disabled and the group is busy", () => {
    const html = render(groupOf(buildAParts()), { busy: true })
    const remove = /<button[^>]*aria-label="Remove Custom PC build"[^>]*>/.exec(
      html
    )![0]
    expect(isDisabled(remove)).toBe(true)
    expect(html).toContain('aria-busy="true"')
  })

  test("a failed removal is an alert on the group", () => {
    const html = render(groupOf(buildAParts()), {
      message: { kind: "error", text: "Couldn't update your cart. Try again." },
    })
    expect(html).toMatch(
      /<p role="alert"[^>]*>Couldn(&#x27;|')t update your cart\. Try again\.<\/p>/
    )
  })
})

describe("in the cart (E35)", () => {
  const single: CartLineView = {
    kind: "single",
    id: "l1",
    productId: "p1",
    name: "AMD Ryzen 5 7600",
    slug: "amd-ryzen-5-7600",
    categorySlug: "cpu",
    brand: "AMD",
    image: null,
    price: 1_149_500,
    salePrice: null,
    unitPrice: 1_149_500,
    quantity: 2,
    lineTotal: 2_299_000,
    status: "in-stock",
    preorderShipsOn: null,
    sold: true,
    max: 12,
    flag: null,
    setTo: null,
  }
  const view: CartView = {
    entries: [groupOf(buildAParts()), single],
    subtotal: 9_205_000,
    count: 3,
    flagged: 0,
  }
  const html = renderToStaticMarkup(
    <CartBody
      view={view}
      busy={new Set()}
      messages={{}}
      status=""
      onQuantity={() => {}}
      onSetTo={() => {}}
      onRemove={() => {}}
      onRemoveGroup={() => {}}
    />
  )

  test("a group and a single line are listed in the order given", () => {
    expect(html.indexOf("Custom PC build · 8 parts")).toBeLessThan(
      html.indexOf("Quantity of AMD Ryzen 5 7600")
    )
  })

  test("the subtotal counts the group as one", () => {
    expect(html).toContain("Subtotal (3 items)")
    expect(html).toContain("₱92,050.00")
  })

  test("a cart with only a group isn't the empty state", () => {
    const only = renderToStaticMarkup(
      <CartBody
        view={{
          entries: [view.entries[0]],
          subtotal: 6_906_000,
          count: 1,
          flagged: 0,
        }}
        busy={new Set()}
        messages={{}}
        status=""
        onQuantity={() => {}}
        onSetTo={() => {}}
        onRemove={() => {}}
        onRemoveGroup={() => {}}
      />
    )
    expect(only).not.toContain("Your cart is empty")
    expect(only).toContain("Subtotal (1 item)")
  })
})

// docs/specs/027-cart-stock-flags, Behavior 10–13: a group's flags
describe("a group with flagged parts", () => {
  const flagged = (
    group: CartGroupView,
    entries: [AnyBuildPart, ProductFlag][]
  ): CartGroupView => ({
    ...group,
    flags: groupPartFlags(
      group.slots,
      new Map(entries.map(([part, flag]) => [part.id, flag]))
    ),
  })
  const over: ProductFlag = { kind: "over-stock", stock: 2, total: 3 }
  const out: ProductFlag = { kind: "out-of-stock" }

  test("E1: one flagged part is named, also when the group is collapsed", () => {
    const html = render(
      flagged(groupOf(buildAParts()), [[seed.ryzen5_7600, over]])
    )
    expect(html).toContain(
      `${seed.ryzen5_7600.name}: Only 2 in stock, 3 in your cart`
    )
    expect(html).toMatch(/<button[^>]*aria-expanded="false"/)
    // The row isn't in the page until it is opened
    expect(html.match(/Only 2 in stock/g)).toHaveLength(1)
  })

  test("E3: out of stock, flag and row; the total and status are unchanged", () => {
    const base = groupOf(buildAParts(), {
      status: { [seed.ryzen5_7600.id]: "out-of-stock" },
    })
    const group = flagged(base, [[seed.ryzen5_7600, out]])
    expect(render(group)).toContain(`${seed.ryzen5_7600.name}: Out of stock`)
    const open = render(group, { defaultExpanded: true })
    expect(open.match(/Out of stock/g)).toHaveLength(2)
    expect(open).toContain("₱69,060.00")
    expect(open).not.toContain("Incomplete")
  })

  test("E14: several flagged parts are counted, and each row says why", () => {
    const group = flagged(
      groupOf(buildAParts(), {
        status: {
          [seed.ryzen5_7600.id]: "out-of-stock",
          [seed.rtx4060.id]: "out-of-stock",
        },
      }),
      [
        [seed.ryzen5_7600, out],
        [seed.rtx4060, out],
      ]
    )
    expect(render(group)).toContain("2 parts need attention")
    const open = render(group, { defaultExpanded: true })
    expect(open.match(/Out of stock/g)).toHaveLength(2)
  })

  test("E15: a part no longer sold is flagged by its row alone", () => {
    const group = groupOf(buildAParts(), { retired: [seed.lancool216] })
    expect(render(group)).toContain(`${seed.lancool216.name}: No longer sold`)
    expect(render(group, { defaultExpanded: true })).toContain(
      "1 part is no longer sold"
    )
  })

  test("E16: an over-stock part keeps its stock line and adds the text", () => {
    const group = flagged(groupOf(buildAParts()), [[seed.pro990, over]])
    const open = render(group, { defaultExpanded: true })
    expect(open).toContain("In stock")
    expect(open.match(/Only 2 in stock, 3 in your cart/g)).toHaveLength(2)
  })

  test("E20: three reasons are one flag, with the three labels in the rows", () => {
    const group = flagged(
      groupOf(buildAParts(), {
        retired: [seed.ryzen5_7600],
        status: {
          [seed.rtx4060.id]: "out-of-stock",
          [seed.peerless.id]: "pre-order",
        },
      }),
      [
        [seed.rtx4060, out],
        [seed.peerless, { kind: "pre-order" }],
      ]
    )
    expect(render(group)).toContain("3 parts need attention")
    const open = render(group, { defaultExpanded: true })
    for (const label of ["No longer sold", "Out of stock", "Pre-order only"]) {
      expect(open).toContain(label)
    }
  })

  test("a group has no Set to; Remove is still there", () => {
    const html = render(
      flagged(groupOf(buildAParts()), [[seed.ryzen5_7600, over]]),
      { defaultExpanded: true }
    )
    expect(html).not.toContain("Set to")
    expect(html).toContain('aria-label="Remove Custom PC build"')
  })

  test("a clean group has no flag", () => {
    expect(render(groupOf(buildAParts()))).not.toContain("need attention")
    expect(render(groupOf(buildAParts()))).not.toContain("Only ")
  })
})
