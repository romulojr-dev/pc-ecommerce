import { describe, expect, it } from "vitest"

import { parsePsgcPath, readPsgcText } from "./files"

// docs/specs/028-shipping-data-and-fee-rules, Behavior 8 and R4, R5
describe("parsePsgcPath", () => {
  it("accepts the four known shapes for the current version", () => {
    expect(parsePsgcPath("2026Q3", ["manifest.json"])).toEqual({
      kind: "manifest",
    })
    expect(parsePsgcPath("2026Q3", ["regions.json"])).toEqual({
      kind: "regions",
    })
    expect(parsePsgcPath("2026Q3", ["provinces", "1300000000.json"])).toEqual({
      kind: "provinces",
      code: "1300000000",
    })
    expect(parsePsgcPath("2026Q3", ["cities", "0702200000.json"])).toEqual({
      kind: "cities",
      code: "0702200000",
    })
  })

  it("refuses another version", () => {
    expect(parsePsgcPath("2099Q1", ["regions.json"])).toBeNull()
    expect(parsePsgcPath("", ["regions.json"])).toBeNull()
  })

  it.each([
    [[]],
    [["regions"]],
    [["regions.json", "x"]],
    [["provinces", "abc.json"]],
    [["provinces", "130000000.json"]],
    [["provinces", "13000000000.json"]],
    [["provinces", "1300000000"]],
    [["cities", "1300000000.json.bak"]],
    [["barangays", "1300000000.json"]],
    [["..", "package.json"]],
    [["../../package.json"]],
    [["cities", "../../package.json"]],
    [["cities", "..\\..\\package.json"]],
    [["cities", "1300000000.json", "x"]],
  ])("refuses %j", (segments) => {
    expect(parsePsgcPath("2026Q3", segments)).toBeNull()
  })
})

describe("readPsgcText", () => {
  it("reads a file as committed and returns null for a missing one", async () => {
    const regions = await readPsgcText({ kind: "regions" })
    expect(regions).not.toBeNull()
    expect(JSON.parse(regions!)).toBeInstanceOf(Array)
    expect(
      await readPsgcText({ kind: "cities", code: "9999999999" })
    ).toBeNull()
  })
})
