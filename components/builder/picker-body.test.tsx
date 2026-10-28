import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, test } from "vitest"

import { pickerList } from "@/lib/build-state/picker"
import type { Build, Slot } from "@/lib/builder"
import { PICKER_TODAY, seedCandidates } from "@/test-support/seed-candidates"
import { buildA, buildOf, seed, seedPart } from "@/test-support/seed-parts"

import { PickerBody, type PickerBodyProps } from "./picker-body"

// The slot picker's states as markup (docs/specs/021-slot-picker, Behavior
// 5–17), from pickerList on the seed. Interaction (toggle, focus, the
// confirmation) is covered by the E2E tests.

function render(
  build: Build,
  slot: Slot,
  {
    showAll = false,
    status = "ready",
    candidates = seedCandidates(slot),
  }: {
    showAll?: boolean
    status?: PickerBodyProps["status"]
    candidates?: ReturnType<typeof seedCandidates>
  } = {}
) {
  const list = pickerList(build, slot, candidates, { showAll })
  return renderToStaticMarkup(
    <PickerBody
      slot={slot}
      status={status}
      list={list}
      showAll={showAll}
      today={PICKER_TODAY}
      onAdd={() => {}}
      onRetry={() => {}}
    />
  )
}

// HTML-escaped, as the markup holds it ("&#x27;", "&quot;")
const text = (value: string) =>
  renderToStaticMarkup(<>{value}</>).replace(/[  ]/g, " ")
const plain = (html: string) => html.replace(/[  ]/g, " ")

// A card's button, by its accessible name, and whether it is disabled
function button(html: string, label: string) {
  const escaped = text(label).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const match = html.match(
    new RegExp(`<button[^>]*aria-label="${escaped}"[^>]*>`)
  )
  return match === null
    ? null
    : { disabled: /\sdisabled(=""|\s|>)/.test(match[0]), html: match[0] }
}

const ryzen7600 = buildOf(seed.ryzen5_7600)

describe("PickerBody", () => {
  test("the default list: count line and add buttons (E2)", () => {
    const html = render(ryzen7600, "motherboard")
    expect(html).toContain(
      "6 of 18 motherboards fit your build and are in stock."
    )
    expect(html).toMatch(/<p aria-live="polite"/)
    expect(
      button(html, `Add ${seed.strixB650a.name} to your build`)
    ).toMatchObject({ disabled: false })
    expect(html).not.toContain("MSI PRO B760M-A WiFi DDR4")
  })

  test("Show all: greyed cards with their reasons as text (E3)", () => {
    const html = plain(render(ryzen7600, "motherboard", { showAll: true }))
    expect(html).toContain("Showing all 18 motherboards.")
    expect(html).toContain(
      text(
        "The AMD Ryzen 5 7600 (AM5) doesn't fit the LGA1700 socket on the MSI PRO B760M-A WiFi DDR4."
      )
    )
    expect(html).toContain("Pre-order: ships February 12, 2027")
    expect(html).toContain("Out of stock")
    expect(html).toContain("bg-muted/60")
  })

  test("warnings show a badge and the message (E5)", () => {
    const html = plain(render(buildOf(seed.ryzen7_9800x3d), "motherboard"))
    expect(html).toContain(">Warning</p>")
    expect(html).toContain(
      "may need a BIOS update to run the AMD Ryzen 7 9800X3D"
    )
  })

  test("an incompatible part offers Add anyway (E13)", () => {
    const html = render(ryzen7600, "motherboard", { showAll: true })
    expect(
      button(html, "Add MSI PRO B760M-A WiFi DDR4 to your build anyway")
    ).toMatchObject({ disabled: false })
  })

  test("parts that can't be bought have a disabled button with the reason (E14, E14a)", () => {
    const html = render(buildA(), "gpu", { showAll: true })
    const astral = button(html, `Add ${seed.rtx5090Astral.name} to your build`)
    expect(astral).toMatchObject({ disabled: true })
    expect(astral!.html).toContain(
      `aria-describedby="picker-reason-${seed.rtx5090Astral.id}"`
    )
    expect(html).toContain(
      `id="picker-reason-${seed.rtx5090Astral.id}" class="max-w-64 text-xs text-muted-foreground">Only parts in stock can be added to a build.</p>`
    )
    expect(
      button(html, `Add ${seed.rtx5090Astral.name} to your build anyway`)
    ).toBeNull()
  })

  test("the current part is marked, with no button (E6, E11a)", () => {
    const html = render(buildA(), "gpu")
    expect(html).toContain(">Current</p>")
    expect(button(html, `Add ${seed.rtx4060.name} to your build`)).toBeNull()
  })

  test("a drive at its stock: disabled, with the reason (E19)", () => {
    const build = buildA()
    build.storage = [{ part: seed.pro990, quantity: 30 }]
    const html = render(build, "storage")
    expect(html).toContain("In your build (×30)")
    expect(button(html, `Add ${seed.pro990.name} to your build`)).toMatchObject(
      { disabled: true }
    )
    expect(html).toContain("Your build already has all 30 we have in stock.")
  })

  test("a full build shows the note (E20)", () => {
    const drives = seedCandidates("storage")
    const build = buildA()
    build.storage = drives.slice(0, 13).map(({ data }) => ({
      part: seedPart("storage", data.part.id),
      quantity: 1,
    }))
    const html = render(build, "storage", { candidates: drives })
    expect(html).toContain(
      "Your build has the most parts it can hold. Remove a drive to add another."
    )
  })

  test("the banner names the error no candidate fixes (E23)", () => {
    const trio = seedPart("gpu", "GeForce RTX 5090 32G GAMING TRIO OC")
    const html = plain(render(buildOf(trio, seed.mwe550), "cpu"))
    expect(html).toContain('role="status"')
    expect(html).toContain(text("Picking a CPU won't fix this:"))
    expect(html).toContain("needs an estimated 748 W")
  })

  test("nothing fits: the empty state (E26)", () => {
    const html = render(buildOf(seed.ryzen5_7600, seed.furyDdr4), "motherboard")
    expect(html).toContain(
      text(
        'No motherboard fits your build. Turn on "Show all" to see why, or change your CPU or memory.'
      )
    )
    expect(html).not.toContain("<ul")
  })

  test("some fit, none can be bought (E27)", () => {
    const html = render(buildOf(seed.ryzen5_7600, seed.ridge), "motherboard", {
      candidates: seedCandidates("motherboard", {
        "B650I LIGHTNING WIFI": { stock: 0 },
      }),
    })
    expect(html).toContain(
      text(
        'No motherboard that fits your build is in stock right now. Turn on "Show all" to see the ones that fit, or change your CPU or case.'
      )
    )
  })

  test("no products in the category (E28)", () => {
    const html = render({}, "cpu-cooler", { candidates: [] })
    expect(html).toContain("There are no CPU coolers in the store right now.")
    expect(html).not.toContain("fit your build and are in stock")
  })

  test("loading: skeletons and a message for screen readers (E30)", () => {
    const html = render({}, "cpu", { status: "loading", candidates: [] })
    expect(html).toContain("Loading CPUs…")
    expect(html).toContain('data-slot="skeleton"')
    expect(html).not.toContain("There are no")
  })

  test("error: the message and Try again (E31)", () => {
    const html = render({}, "cpu", { status: "error", candidates: [] })
    expect(html).toContain('role="alert"')
    expect(html).toContain(text("We couldn't load the CPUs."))
    expect(html).toContain("Try again")
    expect(html).not.toContain("There are no")
  })
})
