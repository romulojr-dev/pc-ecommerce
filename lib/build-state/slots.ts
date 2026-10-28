import type { Slot } from "@/lib/builder"
import { builderCategories } from "@/lib/specs"

// Shopper-facing words for each slot (docs/specs/020-builder-page and
// docs/specs/021-slot-picker, Messages)
type SlotCopy = {
  // The category name: row headings and notices ("Graphics Card")
  name: string
  // The empty slot's button and the picker's title ("Choose a graphics card")
  choose: string
  // In a sentence ("Replace the graphics card in your build?", "change your
  // CPU or memory")
  noun: string
  // One part, counted ("No memory kit fits your build.", "Picking a memory
  // kit won't fix this:")
  item: string
  // Several parts ("6 of 18 motherboards fit your build and are in stock.")
  plural: string
}

const copy = (
  slot: Slot,
  choose: string,
  noun: string,
  item: string,
  plural: string
): SlotCopy => ({
  name: builderCategories[slot].name,
  choose,
  noun,
  item,
  plural,
})

export const SLOT_COPY: Record<Slot, SlotCopy> = {
  cpu: copy("cpu", "Choose a CPU", "CPU", "CPU", "CPUs"),
  motherboard: copy(
    "motherboard",
    "Choose a motherboard",
    "motherboard",
    "motherboard",
    "motherboards"
  ),
  memory: copy(
    "memory",
    "Choose memory",
    "memory",
    "memory kit",
    "memory kits"
  ),
  storage: copy("storage", "Choose storage", "drive", "drive", "drives"),
  gpu: copy(
    "gpu",
    "Choose a graphics card",
    "graphics card",
    "graphics card",
    "graphics cards"
  ),
  case: copy("case", "Choose a case", "case", "case", "cases"),
  psu: copy(
    "psu",
    "Choose a power supply",
    "power supply",
    "power supply",
    "power supplies"
  ),
  "cpu-cooler": copy(
    "cpu-cooler",
    "Choose a CPU cooler",
    "CPU cooler",
    "CPU cooler",
    "CPU coolers"
  ),
}
