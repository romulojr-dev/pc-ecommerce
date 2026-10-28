import { specValue } from "../format"
import { one, type Rule } from "./rule"

// Memory quantity doesn't matter: every kit in the slot is the same kit
export const memoryType: Rule = {
  id: "memory-type",
  severity: "error",
  check(build) {
    const memory = one(build, "memory")
    const board = one(build, "motherboard")
    if (!memory || !board) return null
    if (memory.specs.memoryType === board.specs.memoryType) return null
    const kitType = specValue("memory", "memoryType", memory.specs.memoryType)
    const boardType = specValue(
      "motherboard",
      "memoryType",
      board.specs.memoryType
    )
    return {
      parts: [memory, board],
      message: `The ${memory.name} is ${kitType} memory, but the ${board.name} takes ${boardType}.`,
    }
  },
}
