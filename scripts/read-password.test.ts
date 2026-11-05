import { Readable } from "node:stream"

import { describe, expect, test } from "vitest"

import { PasswordInputError, readPasswordFromStream } from "./read-password"

// docs/specs/039-staff-sign-in-admin-shell, U9

const stream = (text: string) => Readable.from([Buffer.from(text, "utf8")])

describe("readPasswordFromStream", () => {
  test("the first line of piped input, without its line ending (U9)", async () => {
    expect(
      await readPasswordFromStream(stream("correct horse battery\n"))
    ).toBe("correct horse battery")
    expect(
      await readPasswordFromStream(stream("correct horse battery\r\n"))
    ).toBe("correct horse battery")
    expect(await readPasswordFromStream(stream("no newline at the end"))).toBe(
      "no newline at the end"
    )
  })

  test("only the first line counts", async () => {
    expect(
      await readPasswordFromStream(stream("first line here\nsecond\n"))
    ).toBe("first line here")
  })

  test("spaces inside and at the ends are kept", async () => {
    expect(await readPasswordFromStream(stream("  two spaces in  \n"))).toBe(
      "  two spaces in  "
    )
  })

  test("input in several chunks is joined", async () => {
    const chunks = Readable.from([
      Buffer.from("corr"),
      Buffer.from("ect horse\n"),
    ])
    expect(await readPasswordFromStream(chunks)).toBe("correct horse")
  })

  test("empty input is an error that holds no value (U9)", async () => {
    for (const text of ["", "\n", "\r\n"]) {
      const error = await readPasswordFromStream(stream(text)).catch((e) => e)
      expect(error).toBeInstanceOf(PasswordInputError)
      expect(error.message).toBe("No password was given.")
    }
  })

  test("a multi-byte password survives", async () => {
    expect(await readPasswordFromStream(stream("pässwörd-日本語-1234\n"))).toBe(
      "pässwörd-日本語-1234"
    )
  })
})
