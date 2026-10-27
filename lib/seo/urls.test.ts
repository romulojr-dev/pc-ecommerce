import { describe, expect, test } from "vitest"

import { absoluteUrl } from "./urls"

describe("absoluteUrl", () => {
  test.each([
    { siteUrl: "https://pcsilicon.ph", path: "/cpu" },
    { siteUrl: "https://pcsilicon.ph/", path: "/cpu" },
    { siteUrl: "https://pcsilicon.ph/", path: "cpu" },
  ])("joins $siteUrl and $path with one slash", ({ siteUrl, path }) => {
    expect(absoluteUrl(siteUrl, path)).toBe("https://pcsilicon.ph/cpu")
  })

  test("the home URL has no trailing slash, like metadataBase's", () => {
    expect(absoluteUrl("https://pcsilicon.ph/", "/")).toBe(
      "https://pcsilicon.ph"
    )
    expect(absoluteUrl("https://pcsilicon.ph", "/")).toBe(
      "https://pcsilicon.ph"
    )
  })

  test("keeps the query string", () => {
    expect(absoluteUrl("https://pcsilicon.ph", "/cpu?page=2")).toBe(
      "https://pcsilicon.ph/cpu?page=2"
    )
  })

  test("leaves absolute URLs as they are", () => {
    const url = "https://cdn.example.com/images/cpu.png"
    expect(absoluteUrl("https://pcsilicon.ph", url)).toBe(url)
  })
})
