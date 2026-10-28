import { z } from "zod"

import { type Slot, SLOTS } from "@/lib/builder"
import type { ProductCardData } from "@/lib/products"

import type { BuilderPartData } from "./parts"

// The slot picker's candidates (docs/specs/021-slot-picker, Rules ›
// Candidates). Shared by the browser and the route handler, so it imports no
// server code.

// The `slot` query parameter, as every value given (searchParams.getAll):
// exactly one, matching one of the eight slots exactly. Anything else is a
// 400, like the parts route.
export const builderCandidatesQuerySchema = z
  .array(z.enum(SLOTS as [Slot, ...Slot[]]))
  .length(1)
  .transform(([slot]) => slot)

// One candidate: what the rules, the build and a slot row need (the same as
// the parts route's), and what its card shows, from one row
export type BuilderCandidate = {
  data: BuilderPartData
  card: ProductCardData
}

// The route's response. `today` is the server's Manila date, which the cards
// use for pre-orders, so they agree with data.stockStatus.
export type BuilderCandidatesResponse = {
  today: string
  candidates: BuilderCandidate[]
}
