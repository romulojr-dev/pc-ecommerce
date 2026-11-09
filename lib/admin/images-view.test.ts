import { describe, expect, test } from "vitest"

import {
  makeMain,
  moveDown,
  moveUp,
  planUploads,
  uploadLine,
} from "./images-view"

const MB = 1024 * 1024
const file = (name: string, size = MB) => ({ name, size })

describe("planUploads", () => {
  test("E2: several files are accepted in selection order", () => {
    expect(planUploads([file("a"), file("b")], 1)).toEqual({
      accepted: [0, 1],
      refused: [],
    })
  })

  test("a file over 4 MB is refused, the others still go", () => {
    const plan = planUploads([file("big", 4 * MB + 1), file("ok")], 0)
    expect(plan.accepted).toEqual([1])
    expect(plan.refused).toEqual([
      { index: 0, reason: "It is larger than 4 MB." },
    ])
  })

  test("exactly 4 MB is allowed", () => {
    expect(planUploads([file("edge", 4 * MB)], 0).accepted).toEqual([0])
  })

  test("E12: files past the room left are refused with the full message", () => {
    const plan = planUploads([file("a"), file("b"), file("c")], 6)
    expect(plan.accepted).toEqual([0, 1])
    expect(plan.refused).toEqual([
      {
        index: 2,
        reason: "This product already has 8 photos. Remove one to add another.",
      },
    ])
  })

  test("a full product accepts nothing", () => {
    expect(planUploads([file("a")], 8).accepted).toEqual([])
  })

  test("a file that is too large does not take a place", () => {
    const plan = planUploads([file("big", 5 * MB), file("a")], 7)
    expect(plan.accepted).toEqual([1])
  })
})

describe("moves", () => {
  const order = ["a", "b", "c"]

  test("E20: move down swaps with the next", () => {
    expect(moveDown(order, 0)).toEqual(["b", "a", "c"])
    expect(moveDown(order, 1)).toEqual(["a", "c", "b"])
  })

  test("move up swaps with the previous", () => {
    expect(moveUp(order, 2)).toEqual(["a", "c", "b"])
  })

  test("a move off either end changes nothing", () => {
    expect(moveUp(order, 0)).toEqual(order)
    expect(moveDown(order, 2)).toEqual(order)
    expect(moveUp(order, 9)).toEqual(order)
    expect(moveDown(order, -1)).toEqual(order)
  })

  test("E19: make main puts that photo first and keeps the others in order", () => {
    expect(makeMain(["a", "b", "c", "d"], 2)).toEqual(["c", "a", "b", "d"])
  })

  test("making the main image main changes nothing", () => {
    expect(makeMain(order, 0)).toEqual(order)
  })

  test("moves never change the input", () => {
    const input = ["a", "b", "c"]
    moveUp(input, 2)
    makeMain(input, 2)
    expect(input).toEqual(["a", "b", "c"])
  })
})

describe("uploadLine", () => {
  test("success and refusal read as 'name: reason'", () => {
    expect(uploadLine("box.png", { ok: true })).toBe("box.png added.")
    expect(
      uploadLine("logo.svg", {
        ok: false,
        message: "Only JPEG, PNG and WebP photos can be uploaded.",
      })
    ).toBe("logo.svg: Only JPEG, PNG and WebP photos can be uploaded.")
  })
})
