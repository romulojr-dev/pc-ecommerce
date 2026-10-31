import { describe, expect, it } from "vitest"

import { safeErrorText } from "./log"

describe("safeErrorText", () => {
  it("names the error and its code, never its message", () => {
    const error = Object.assign(
      new Error("Key (idempotencyKey)=(SECRETSECRETSECRET) already exists."),
      { name: "PrismaClientKnownRequestError", code: "P2002" }
    )
    expect(safeErrorText(error)).toBe("PrismaClientKnownRequestError (P2002)")
  })

  it("names an error with no code", () => {
    expect(safeErrorText(new TypeError("secret detail"))).toBe("TypeError")
  })

  it("ignores a code that isn't text", () => {
    expect(safeErrorText(Object.assign(new Error("x"), { code: 23505 }))).toBe(
      "Error"
    )
  })

  it("never reads what isn't an error", () => {
    expect(safeErrorText("a secret string")).toBe("unknown error")
    expect(safeErrorText({ message: "a secret" })).toBe("unknown error")
    expect(safeErrorText(null)).toBe("unknown error")
  })
})
