import { one, type Rule } from "./rule"

// Warns from the first pick of such a CPU, before the shopper reaches the
// GPU slot, so the message reads as the next step
export const integratedGraphics: Rule = {
  id: "integrated-graphics",
  severity: "warning",
  check(build) {
    const cpu = one(build, "cpu")
    if (!cpu || one(build, "gpu") || cpu.specs.hasIntegratedGraphics) {
      return null
    }
    return {
      parts: [cpu],
      message: `The ${cpu.name} has no integrated graphics, so add a graphics card to get a display.`,
    }
  },
}
