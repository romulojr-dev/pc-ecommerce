import type { Slot } from "@/lib/builder"
import { builderCategories } from "@/lib/specs"

// Shopper-facing words for each slot (docs/specs/020-builder-page, Messages)
type SlotCopy = {
  // The category name: row headings and notices ("Graphics Card")
  name: string
  // The empty slot's link ("Choose a graphics card")
  choose: string
  // In a sentence ("Replace the graphics card in your build?"). Storage
  // never replaces, so it has none.
  noun: string | null
}

const copy = (slot: Slot, choose: string, noun: string | null): SlotCopy => ({
  name: builderCategories[slot].name,
  choose,
  noun,
})

export const SLOT_COPY: Record<Slot, SlotCopy> = {
  cpu: copy("cpu", "Choose a CPU", "CPU"),
  motherboard: copy("motherboard", "Choose a motherboard", "motherboard"),
  memory: copy("memory", "Choose memory", "memory"),
  storage: copy("storage", "Choose storage", null),
  gpu: copy("gpu", "Choose a graphics card", "graphics card"),
  case: copy("case", "Choose a case", "case"),
  psu: copy("psu", "Choose a power supply", "power supply"),
  "cpu-cooler": copy("cpu-cooler", "Choose a CPU cooler", "CPU cooler"),
}
