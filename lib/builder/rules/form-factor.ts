import { specList, specValue } from "../format"
import { one, type Rule } from "./rule"

export const formFactor: Rule = {
  id: "form-factor",
  severity: "error",
  check(build) {
    const board = one(build, "motherboard")
    const pcCase = one(build, "case")
    if (!board || !pcCase) return null
    const fits = pcCase.specs.motherboardFormFactors
    if (fits.includes(board.specs.formFactor)) return null
    const boardSize = specValue(
      "motherboard",
      "formFactor",
      board.specs.formFactor
    )
    const caseSizes = specList("case", "motherboardFormFactors", fits, "or")
    return {
      parts: [board, pcCase],
      message: `The ${board.name} (${boardSize}) doesn't fit the ${pcCase.name}, which takes ${caseSizes} boards.`,
    }
  },
}
