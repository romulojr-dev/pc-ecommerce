import { describe, expect, test } from "vitest"

import { SLOTS } from "@/lib/builder"

import { builderCandidatesQuerySchema } from "./candidates"

// searchParams.getAll("slot") for a query string
const values = (query: string) => new URLSearchParams(query).getAll("slot")
const parse = (query: string) =>
  builderCandidatesQuerySchema.safeParse(values(query))

// docs/specs/021-slot-picker, Rules › Candidates
describe("builderCandidatesQuerySchema", () => {
  test.each(SLOTS)("takes the slot %s", (slot) => {
    expect(parse(`?slot=${slot}`).data).toBe(slot)
  })

  test("takes a slug with a hyphen (E35a)", () => {
    expect(parse("?slot=cpu-cooler").data).toBe("cpu-cooler")
  })

  test("refuses a slug that isn't one of the eight (E38)", () => {
    expect(parse("?slot=keyboard").success).toBe(false)
  })

  test.each([
    ["no parameter", ""],
    ["an empty parameter", "?slot="],
  ])("refuses %s (E38a)", (_, query) => {
    expect(parse(query).success).toBe(false)
  })

  test.each(["?slot=CPU", "?slot=%20cpu", "?slot=cpu%20"])(
    "matches exactly, with no trimming or lowercasing: %s (E38b)",
    (query) => {
      expect(parse(query).success).toBe(false)
    }
  )

  test("refuses a repeated parameter (E38c)", () => {
    expect(parse("?slot=cpu&slot=gpu").success).toBe(false)
  })

  test("refuses a category slug that isn't a builder slot (E38d)", () => {
    expect(parse("?slot=fans").success).toBe(false)
  })

  test.each([
    ["a path", "?slot=../admin"],
    ["markup", "?slot=%3Cscript%3E"],
    ["a long value", `?slot=${"a".repeat(200)}`],
  ])("refuses %s (E38e)", (_, query) => {
    expect(parse(query).success).toBe(false)
  })
})
