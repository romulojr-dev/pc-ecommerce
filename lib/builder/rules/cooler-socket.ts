import { specList, specValue } from "../format"
import { one, type Rule } from "./rule"

// Checks the CPU's socket, or the board's when no CPU is picked. When both
// are picked and disagree, the CPU wins: it decides the cooler mount, and
// socket match reports the conflict.
export const coolerSocket: Rule = {
  id: "cooler-socket",
  severity: "error",
  check(build) {
    const cooler = one(build, "cpu-cooler")
    const host = one(build, "cpu") ?? one(build, "motherboard")
    if (!cooler || !host) return null
    const supported = cooler.specs.supportedSockets
    if (supported.includes(host.specs.socket)) return null
    const socket = specValue(host.category, "socket", host.specs.socket)
    const sockets = specList("cpu-cooler", "supportedSockets", supported, "and")
    return {
      parts: [cooler, host],
      message: `The ${cooler.name} doesn't support the ${socket} socket of the ${host.name}. It supports ${sockets}.`,
    }
  },
}
