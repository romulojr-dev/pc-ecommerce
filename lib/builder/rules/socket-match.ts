import { specValue } from "../format"
import { one, type Rule } from "./rule"

export const socketMatch: Rule = {
  id: "socket-match",
  severity: "error",
  check(build) {
    const cpu = one(build, "cpu")
    const board = one(build, "motherboard")
    if (!cpu || !board || cpu.specs.socket === board.specs.socket) return null
    const cpuSocket = specValue("cpu", "socket", cpu.specs.socket)
    const boardSocket = specValue("motherboard", "socket", board.specs.socket)
    return {
      parts: [cpu, board],
      message: `The ${cpu.name} (${cpuSocket}) doesn't fit the ${boardSocket} socket on the ${board.name}.`,
    }
  },
}
