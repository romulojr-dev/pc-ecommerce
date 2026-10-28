import { plural } from "../format"
import { one, type Rule } from "./rule"

// Every M.2 drive takes a slot, NVMe or SATA (spec 001); 2.5" and 3.5"
// drives don't. One warning for the whole storage slot.
export const m2Slots: Rule = {
  id: "m2-slots",
  severity: "warning",
  check(build) {
    const board = one(build, "motherboard")
    const drives = (build.storage ?? []).filter((entry) =>
      entry.part.specs.formFactor.startsWith("M2_")
    )
    if (!board || drives.length === 0) return null
    const count = drives.reduce((sum, entry) => sum + entry.quantity, 0)
    const slots = board.specs.m2Slots
    if (count <= slots) return null
    const has = `This build has ${plural(count, "M.2 drive")}, but the ${board.name}`
    return {
      parts: [board, ...drives.map((entry) => entry.part)],
      message:
        slots === 0
          ? `${has} has no M.2 slots.`
          : `${has} has ${plural(slots, "M.2 slot")}, so ${plural(count - slots, "drive")} won't have a slot.`,
    }
  },
}
