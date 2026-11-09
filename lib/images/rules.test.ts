import { describe, expect, test } from "vitest"

import {
  declaredLength,
  detectImageType,
  MAX_ALT_LENGTH,
  MAX_UPLOAD_BYTES,
  readCappedBody,
  roomFor,
  validateAlt,
} from "./rules"

const bytes = (...values: number[]) => new Uint8Array(values)
const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0))

describe("detectImageType", () => {
  test("JPEG by FF D8 FF", () => {
    expect(detectImageType(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0))).toBe("jpeg")
  })

  test("PNG by its eight-byte signature", () => {
    expect(
      detectImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))
    ).toBe("png")
  })

  test("WebP by RIFF at 0 and WEBP at 8", () => {
    expect(
      detectImageType(
        bytes(...ascii("RIFF"), 1, 2, 3, 4, ...ascii("WEBP"), ...ascii("VP8 "))
      )
    ).toBe("webp")
  })

  test("E6: SVG text is refused, whatever it is declared as", () => {
    expect(detectImageType(bytes(...ascii('<svg xmlns="x"></svg>')))).toBeNull()
    expect(detectImageType(bytes(...ascii("<?xml version")))).toBeNull()
  })

  test("E8: a PDF renamed .jpg is refused", () => {
    expect(detectImageType(bytes(...ascii("%PDF-1.7")))).toBeNull()
  })

  test("GIF is refused", () => {
    expect(detectImageType(bytes(...ascii("GIF89a"), 1, 0, 1, 0))).toBeNull()
  })

  test("RIFF without WEBP is refused (a WAV, say)", () => {
    expect(
      detectImageType(bytes(...ascii("RIFF"), 1, 2, 3, 4, ...ascii("WAVE")))
    ).toBeNull()
  })

  test("empty and truncated headers are refused", () => {
    expect(detectImageType(bytes())).toBeNull()
    expect(detectImageType(bytes(0xff, 0xd8))).toBeNull()
    expect(detectImageType(bytes(0x89, 0x50, 0x4e))).toBeNull()
    expect(
      detectImageType(bytes(...ascii("RIFF"), 1, 2, 3, 4, 0x57))
    ).toBeNull()
  })
})

function streamOf(...chunks: Uint8Array[]) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk)
      controller.close()
    },
  })
}

describe("readCappedBody", () => {
  test("reads a body under the cap", async () => {
    const body = await readCappedBody(streamOf(bytes(1, 2), bytes(3)), 10)
    expect([...(body as Uint8Array)]).toEqual([1, 2, 3])
  })

  test("E10: a body of exactly the cap is read", async () => {
    const body = await readCappedBody(
      streamOf(new Uint8Array(MAX_UPLOAD_BYTES)),
      MAX_UPLOAD_BYTES
    )
    expect((body as Uint8Array).length).toBe(MAX_UPLOAD_BYTES)
  })

  test("E11: one byte over the cap is too large", async () => {
    const result = await readCappedBody(
      streamOf(new Uint8Array(MAX_UPLOAD_BYTES + 1)),
      MAX_UPLOAD_BYTES
    )
    expect(result).toBe("too-large")
  })

  test("E11: reading stops soon after the cap, not at the end of the stream", async () => {
    let pulled = 0
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1
        controller.enqueue(new Uint8Array(1024 * 1024))
      },
    })
    const result = await readCappedBody(endless, MAX_UPLOAD_BYTES)
    expect(result).toBe("too-large")
    // 4 MB of 1 MB chunks, plus the one that crossed the line and a little
    // read-ahead
    expect(pulled).toBeLessThanOrEqual(8)
  })

  test("no body is empty", async () => {
    expect(await readCappedBody(null, 10)).toEqual(new Uint8Array(0))
  })
})

describe("declaredLength", () => {
  test("digits only", () => {
    expect(declaredLength("1234")).toBe(1234)
    expect(declaredLength("0")).toBe(0)
  })

  test.each([null, "", "abc", "-5", "1.5", "1e3", " 12", "1234567890123"])(
    "%j is not a length",
    (header) => {
      expect(declaredLength(header)).toBeNull()
    }
  )
})

describe("validateAlt", () => {
  test("trims", () => {
    expect(validateAlt("  AMD Ryzen 5 7600  ")).toEqual({
      ok: true,
      value: "AMD Ryzen 5 7600",
    })
  })

  test("E23: blank is refused", () => {
    expect(validateAlt("   ")).toEqual({ ok: false, error: "empty" })
    expect(validateAlt("")).toEqual({ ok: false, error: "empty" })
  })

  test("E24: 200 is allowed, 201 is not", () => {
    expect(validateAlt("a".repeat(MAX_ALT_LENGTH)).ok).toBe(true)
    expect(validateAlt("a".repeat(MAX_ALT_LENGTH + 1))).toEqual({
      ok: false,
      error: "too-long",
    })
  })
})

describe("roomFor", () => {
  test("E12: eight photos leave no room", () => {
    expect(roomFor(0)).toBe(8)
    expect(roomFor(7)).toBe(1)
    expect(roomFor(8)).toBe(0)
    expect(roomFor(9)).toBe(0)
  })
})
