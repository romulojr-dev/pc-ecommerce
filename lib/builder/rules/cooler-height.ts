import { specValue } from "../format"
import { one, type Rule } from "./rule"

// Air coolers only: for an AIO the radiator decides (radiator fit). Exactly
// the case's limit fits.
export const coolerHeight: Rule = {
  id: "cooler-height",
  severity: "error",
  check(build) {
    const cooler = one(build, "cpu-cooler")
    const pcCase = one(build, "case")
    if (!cooler || !pcCase || cooler.specs.type !== "AIR") return null
    if (cooler.specs.heightMm <= pcCase.specs.maxCoolerHeightMm) return null
    const height = specValue("cpu-cooler", "heightMm", cooler.specs.heightMm)
    const limit = specValue(
      "case",
      "maxCoolerHeightMm",
      pcCase.specs.maxCoolerHeightMm
    )
    return {
      parts: [cooler, pcCase],
      message: `The ${cooler.name} is ${height} tall, but the ${pcCase.name} fits CPU coolers up to ${limit}.`,
    }
  },
}
