import { describe, expect, test } from "vitest"

import {
  manilaDayRange,
  parseManilaDay,
  startOfManilaDay,
  startOfNextManilaDay,
} from "./manila-day"

// docs/specs/047-admin-audit-log-view: B5, R3, E6, E7, E7b, E9

describe("Manila days", () => {
  test("a day starts at 16:00 UTC the day before", () => {
    expect(startOfManilaDay("2026-11-05").toISOString()).toBe(
      "2026-11-04T16:00:00.000Z"
    )
    expect(startOfNextManilaDay("2026-11-05").toISOString()).toBe(
      "2026-11-05T16:00:00.000Z"
    )
  })

  test("month, year and leap-day ends", () => {
    expect(startOfNextManilaDay("2026-12-31").toISOString()).toBe(
      "2026-12-31T16:00:00.000Z"
    )
    expect(startOfNextManilaDay("2028-02-28").toISOString()).toBe(
      "2028-02-28T16:00:00.000Z"
    )
    expect(startOfNextManilaDay("2028-02-29").toISOString()).toBe(
      "2028-02-29T16:00:00.000Z"
    )
    expect(startOfNextManilaDay("2027-02-28").toISOString()).toBe(
      "2027-02-28T16:00:00.000Z"
    )
  })

  test("parse accepts only real calendar days (E9)", () => {
    expect(parseManilaDay("2026-11-05")).toBe("2026-11-05")
    expect(parseManilaDay("2028-02-29")).toBe("2028-02-29")
    for (const bad of [
      "2026-02-30",
      "2027-02-29",
      "2026-13-01",
      "2026-1-5",
      "",
      "x",
      "2026-11-05T00:00",
    ]) {
      expect(parseManilaDay(bad), bad).toBeNull()
    }
  })

  test("E7b: To is in up to 23:59:59.999 and out at 00:00 the next day", () => {
    const { gte, lt } = manilaDayRange("2026-11-05", "2026-11-05")
    const inRange = (iso: string) => {
      const t = new Date(iso).getTime()
      return t >= gte!.getTime() && t < lt!.getTime()
    }
    expect(inRange("2026-11-05T00:00:00+08:00")).toBe(true)
    expect(inRange("2026-11-05T23:59:59+08:00")).toBe(true)
    expect(inRange("2026-11-05T23:59:59.999+08:00")).toBe(true)
    expect(inRange("2026-11-06T00:00:00+08:00")).toBe(false)
    expect(inRange("2026-11-04T23:59:59.999+08:00")).toBe(false)
  })

  test("E6: the Manila day, not the UTC day", () => {
    const { gte, lt } = manilaDayRange("2026-11-05", "2026-11-05")
    const at = (iso: string) => new Date(iso).getTime()
    // 23:30 Manila on the 5th is 15:30 UTC; 00:10 Manila on the 6th is 16:10 UTC
    expect(at("2026-11-05T15:30:00Z") >= gte!.getTime()).toBe(true)
    expect(at("2026-11-05T15:30:00Z") < lt!.getTime()).toBe(true)
    expect(at("2026-11-05T16:10:00Z") < lt!.getTime()).toBe(false)
  })

  test("open-ended ranges", () => {
    expect(manilaDayRange("", "")).toEqual({})
    expect(manilaDayRange("2026-11-05", "")).toEqual({
      gte: new Date("2026-11-04T16:00:00Z"),
    })
    expect(manilaDayRange("", "2026-11-05")).toEqual({
      lt: new Date("2026-11-05T16:00:00Z"),
    })
  })
})
