import { specList, specValue } from "../format"
import { one, type Rule } from "./rule"

// Liquid coolers only. A warning (PRD): the case's list covers any mounting
// position, so a size may fit one position and not another. An empty list
// means the case takes no AIO.
export const radiatorFit: Rule = {
  id: "radiator-fit",
  severity: "warning",
  check(build) {
    const cooler = one(build, "cpu-cooler")
    const pcCase = one(build, "case")
    if (!cooler || !pcCase || cooler.specs.type !== "AIO") return null
    const sizes = pcCase.specs.radiatorSizesMm
    if (sizes.includes(cooler.specs.radiatorSizeMm)) return null
    const size = specValue(
      "cpu-cooler",
      "radiatorSizeMm",
      cooler.specs.radiatorSizeMm
    )
    const message =
      sizes.length === 0
        ? `The ${pcCase.name} doesn't list any radiator mounts, so the ${size} radiator of the ${cooler.name} may not fit.`
        : `The ${pcCase.name} lists ${specList("case", "radiatorSizesMm", sizes, "or")} radiators, not the ${size} radiator of the ${cooler.name}. It may not fit.`
    return { parts: [cooler, pcCase], message }
  },
}
