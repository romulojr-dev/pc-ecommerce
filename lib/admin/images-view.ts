import { IMAGE_REASONS, IMAGE_UI } from "./images-copy"
import { MAX_UPLOAD_BYTES, roomFor } from "@/lib/images/rules"

// What the Photos section decides without the DOM (docs/specs/049-product-
// images-upload, B6, B7, B10). Pure.

export type PickedFile = { name: string; size: number }

export type UploadPlan = {
  // Indexes into the picked files, in selection order
  accepted: number[]
  refused: { index: number; reason: string }[]
}

// The browser refuses what it can already see is wrong, with the server's
// words, so a hopeless request is not sent (B7). The server checks it all
// again. A file over the limit never takes a place; files past the room left
// are refused.
export function planUploads(
  files: PickedFile[],
  currentCount: number
): UploadPlan {
  const accepted: number[] = []
  const refused: UploadPlan["refused"] = []
  let room = roomFor(currentCount)
  files.forEach((file, index) => {
    if (file.size > MAX_UPLOAD_BYTES) {
      refused.push({ index, reason: IMAGE_REASONS.tooLarge })
    } else if (room <= 0) {
      refused.push({ index, reason: IMAGE_REASONS.full })
    } else {
      accepted.push(index)
      room -= 1
    }
  })
  return { accepted, refused }
}

// The photos' ids in the order a move wants them (B10). A move off either end
// changes nothing.
export function moveUp(order: readonly string[], index: number): string[] {
  if (index <= 0 || index >= order.length) return [...order]
  const next = [...order]
  ;[next[index - 1], next[index]] = [next[index], next[index - 1]]
  return next
}

export function moveDown(order: readonly string[], index: number): string[] {
  if (index < 0 || index >= order.length - 1) return [...order]
  return moveUp(order, index + 1)
}

// That photo first; the others keep their order behind it
export function makeMain(order: readonly string[], index: number): string[] {
  if (index <= 0 || index >= order.length) return [...order]
  return [order[index], ...order.filter((_, i) => i !== index)]
}

// What the server's answer to one upload says on the screen
export function uploadLine(
  name: string,
  answer: { ok: true } | { ok: false; message: string }
): string {
  return answer.ok
    ? IMAGE_UI.added(name)
    : IMAGE_UI.refused(name, answer.message)
}
