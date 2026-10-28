import { specList, specValue } from "../format"
import { one, type Rule } from "./rule"

// Follows the case's data: a case that takes SFX with a bracket lists SFX
export const psuFormFactor: Rule = {
  id: "psu-form-factor",
  severity: "error",
  check(build) {
    const psu = one(build, "psu")
    const pcCase = one(build, "case")
    if (!psu || !pcCase) return null
    const fits = pcCase.specs.psuFormFactors
    if (fits.includes(psu.specs.formFactor)) return null
    const psuSize = specValue("psu", "formFactor", psu.specs.formFactor)
    const caseSizes = specList("case", "psuFormFactors", fits, "or")
    return {
      parts: [psu, pcCase],
      message: `The ${psu.name} (${psuSize}) doesn't fit the ${pcCase.name}, which takes ${caseSizes} power supplies.`,
    }
  },
}
