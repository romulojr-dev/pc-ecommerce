import { specList, specValue } from "../format"
import { one, type Rule } from "./rule"

// The board's nativeCpuGenerations are its launch BIOS's (spec 001 R4). A
// warning only; silent when the sockets differ, since socket match reports
// that.
export const biosUpdate: Rule = {
  id: "bios-update",
  severity: "warning",
  check(build) {
    const cpu = one(build, "cpu")
    const board = one(build, "motherboard")
    if (!cpu || !board || cpu.specs.socket !== board.specs.socket) return null
    const native = board.specs.nativeCpuGenerations
    if (native.includes(cpu.specs.generation)) return null
    const supported = specList(
      "motherboard",
      "nativeCpuGenerations",
      native,
      "and"
    )
    const generation = specValue("cpu", "generation", cpu.specs.generation)
    return {
      parts: [cpu, board],
      message: `The ${board.name} may need a BIOS update to run the ${cpu.name}: its launch BIOS supports ${supported}, not ${generation}.`,
    }
  },
}
