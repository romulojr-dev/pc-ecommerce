import { z } from "zod"

import { INVENTORY_COPY } from "./inventory-copy"

// The shape and rules of a stock adjustment and of the low-stock threshold
// (docs/specs/046-admin-inventory-adjustments, B9–B13, R2, R6, R7). Pure: the
// form shows the errors as you type and the server decides, with the same
// functions. An adjustment is a signed DELTA, never "set to N" (D2).

export const MAX_STOCK = 1_000_000
export const MAX_DELTA = 1_000_000
export const NOTE_MAX = 500
export const CORRECTION_NOTE_MIN = 3
export const THRESHOLD_MAX = 1000

export const STAFF_REASONS = ["RECEIVED", "DAMAGED", "CORRECTION"] as const
export type StaffReason = (typeof STAFF_REASONS)[number]

export function isStaffReason(value: unknown): value is StaffReason {
  return (STAFF_REASONS as readonly unknown[]).includes(value)
}

export type AdjustmentErrors = Partial<
  Record<"reason" | "quantity" | "direction" | "note", string>
>

// ---- What the form sends to the server ----

// Transport: strict, so "set to N", stock or any other key is refused. The
// rules below are checked by the handler, which answers with field errors.
export const adjustStockSchema = z.strictObject({
  productId: z.string().min(1).max(100),
  reason: z.string().max(40),
  delta: z.int().min(-MAX_DELTA).max(MAX_DELTA),
  note: z.string().max(5000),
  // The stock the confirm step showed; only used to word the result
  shownStock: z.int().min(0).max(2_000_000_000),
})
export type AdjustStockInput = z.infer<typeof adjustStockSchema>

export const setLowStockAtSchema = z.strictObject({
  productId: z.string().min(1).max(100),
  lowStockAt: z.int().min(-1_000_000).max(1_000_000),
})
export type SetLowStockAtInput = z.infer<typeof setLowStockAtSchema>

// ---- Rules ----

export type CheckedAdjustment = {
  reason: StaffReason
  delta: number
  note: string | null
}

// The sign each staff reason allows (R2)
function signAllowed(reason: StaffReason, delta: number): boolean {
  if (reason === "RECEIVED") return delta > 0
  if (reason === "DAMAGED") return delta < 0
  return delta !== 0
}

// The note after trimming; empty is no note (R6)
export function cleanNote(note: string): string | null {
  const trimmed = note.trim()
  return trimmed === "" ? null : trimmed
}

export function validateAdjustment(input: {
  reason: string
  delta: number
  note: string
}):
  | { ok: true; value: CheckedAdjustment }
  | { ok: false; errors: AdjustmentErrors } {
  const errors: AdjustmentErrors = {}
  const copy = INVENTORY_COPY.errors
  const note = cleanNote(input.note)

  if (!isStaffReason(input.reason)) errors.reason = copy.reason
  if (
    !Number.isSafeInteger(input.delta) ||
    input.delta === 0 ||
    Math.abs(input.delta) > MAX_DELTA
  ) {
    errors.quantity = copy.quantity
  } else if (
    isStaffReason(input.reason) &&
    !signAllowed(input.reason, input.delta)
  ) {
    errors.quantity = copy.quantity
  }
  if (note !== null && note.length > NOTE_MAX) errors.note = copy.noteTooLong
  else if (
    input.reason === "CORRECTION" &&
    (note === null || note.length < CORRECTION_NOTE_MIN)
  ) {
    errors.note = copy.noteRequired
  }

  if (Object.keys(errors).length > 0 || !isStaffReason(input.reason)) {
    return { ok: false, errors }
  }
  return { ok: true, value: { reason: input.reason, delta: input.delta, note } }
}

// What the person typed: the reason, a positive quantity as text, a direction
// (Correction only) and the note. Turns them into the signed delta, or says
// what is wrong. Digits only: no sign, decimal point, exponent or separator.
export type AdjustmentForm = {
  reason: string
  quantity: string
  direction: string
  note: string
}

export function adjustmentFromForm(
  form: AdjustmentForm
):
  | { ok: true; value: CheckedAdjustment }
  | { ok: false; errors: AdjustmentErrors } {
  const errors: AdjustmentErrors = {}
  const copy = INVENTORY_COPY.errors
  const text = form.quantity.trim()
  let quantity = 0
  if (!/^\d+$/.test(text) || /^0+$/.test(text)) {
    errors.quantity = copy.quantity
  } else if (text.replace(/^0+/, "").length > 7 || Number(text) > MAX_DELTA) {
    errors.quantity = copy.quantityTooBig
  } else {
    quantity = Number(text)
  }

  let sign = 0
  if (form.reason === "RECEIVED") sign = 1
  else if (form.reason === "DAMAGED") sign = -1
  else if (form.reason === "CORRECTION") {
    if (form.direction === "add") sign = 1
    else if (form.direction === "remove") sign = -1
    else errors.direction = copy.direction
  }

  const checked = validateAdjustment({
    reason: form.reason,
    delta: sign * quantity,
    note: form.note,
  })
  if (!checked.ok) {
    // The quantity message from the typed text is the better one; a delta of 0
    // here only means the quantity or direction is already reported
    for (const key of ["reason", "direction", "note"] as const) {
      const message = checked.errors[key]
      if (message) errors[key] = message
    }
  }
  if (Object.keys(errors).length > 0 || !checked.ok) {
    return { ok: false, errors }
  }
  return checked
}

// ---- The threshold ----

export function validateThreshold(
  value: number
): { ok: true; value: number } | { ok: false; error: string } {
  if (!Number.isSafeInteger(value) || value < 0 || value > THRESHOLD_MAX) {
    return { ok: false, error: INVENTORY_COPY.errors.lowStockAt }
  }
  return { ok: true, value }
}

export function thresholdFromText(
  text: string
): { ok: true; value: number } | { ok: false; error: string } {
  const trimmed = text.trim()
  if (!/^\d{1,4}$/.test(trimmed)) {
    return { ok: false, error: INVENTORY_COPY.errors.lowStockAt }
  }
  return validateThreshold(Number(trimmed))
}
