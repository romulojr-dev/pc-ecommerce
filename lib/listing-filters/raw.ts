import type { RawSearchParams } from "./types"

// A repeated key (?page=1&page=2) counts by its first value
export function first(
  value: string | string[] | undefined
): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

// Every value of a key, in order; none for a missing key
export function all(raw: RawSearchParams, key: string): string[] {
  const value = raw[key]
  return value === undefined ? [] : [value].flat()
}
