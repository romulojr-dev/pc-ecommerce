import { specValue } from "../format"
import { one, type Rule } from "./rule"

// A warning (PRD). It runs even when memory slots fails: too many sticks
// doesn't make the capacity fact meaningless (spec 019 D10).
export const memoryCapacity: Rule = {
  id: "memory-capacity",
  severity: "warning",
  check(build) {
    const entry = build.memory?.[0]
    const board = one(build, "motherboard")
    if (!entry || !board) return null
    const { part: kit, quantity } = entry
    const totalGb = kit.specs.capacityGb * quantity
    if (totalGb <= board.specs.maxMemoryGb) return null
    const total = specValue("memory", "capacityGb", totalGb)
    const max = specValue("motherboard", "maxMemoryGb", board.specs.maxMemoryGb)
    const kits =
      quantity === 1
        ? `The ${kit.name} is ${total}`
        : `${quantity} kits of the ${kit.name} make ${total}`
    return {
      parts: [kit, board],
      message: `${kits}, more than the ${max} the ${board.name} supports.`,
    }
  },
}
