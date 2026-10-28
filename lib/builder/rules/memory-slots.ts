import { plural } from "../format"
import { one, type Rule } from "./rule"

// Every stick of every kit needs its own slot: moduleCount × quantity
export const memorySlots: Rule = {
  id: "memory-slots",
  severity: "error",
  check(build) {
    const entry = build.memory?.[0]
    const board = one(build, "motherboard")
    if (!entry || !board) return null
    const { part: kit, quantity } = entry
    const modules = kit.specs.moduleCount * quantity
    const slots = board.specs.memorySlots
    if (modules <= slots) return null
    const sticks = plural(modules, "memory module")
    const kits =
      quantity === 1
        ? `The ${kit.name} has ${sticks}`
        : `${quantity} kits of the ${kit.name} make ${sticks}`
    return {
      parts: [kit, board],
      message: `${kits}, but the ${board.name} has ${plural(slots, "memory slot")}.`,
    }
  },
}
