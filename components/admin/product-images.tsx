"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useId, useRef, useState } from "react"

import {
  removeProductImageAction,
  reorderProductImagesAction,
  setImageAltAction,
} from "@/app/admin/(shell)/products/actions"
import { ProductImage } from "@/components/product/product-image"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { IMAGE_REASONS, IMAGE_UI } from "@/lib/admin/images-copy"
import {
  makeMain,
  moveDown,
  moveUp,
  planUploads,
  uploadLine,
} from "@/lib/admin/images-view"
import { validateAlt } from "@/lib/images/rules"
import { cn, focusRing } from "@/lib/utils"

// The Photos section of a product page (docs/specs/049-product-images-upload,
// B1–B13). Every control is a button or a native input, so it all works with
// the keyboard. Demo sees the same section with every control disabled.
//
// Uploading sends one request per file, in the order picked, so each stays
// under Vercel's 4.5 MB limit and a refused file doesn't stop the others.
// Reorders and removals send the list this screen showed; the server refuses
// them as stale when the photos changed meanwhile.

type Photo = { id: string; url: string; alt: string }

export type ProductImagesProps = {
  productId: string
  productName: string
  categoryName: string
  // The category placeholder, shown while there is no photo
  placeholder: { url: string; alt: string } | null
  images: Photo[]
  // The next product with no photo, for the link after an upload
  next: { id: string; name: string } | null
  readOnly: boolean
}

const UPLOAD_URL = "/api/admin/images"

async function uploadOne(
  productId: string,
  file: File
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const response = await fetch(
      `${UPLOAD_URL}?kind=product&id=${encodeURIComponent(productId)}`,
      { method: "POST", body: file }
    )
    const body = (await response.json()) as { ok?: boolean; message?: string }
    if (response.ok && body.ok) return { ok: true }
    return { ok: false, message: body.message ?? IMAGE_REASONS.failed }
  } catch {
    // A network error, or an answer that isn't ours (the platform's own 413)
    return { ok: false, message: IMAGE_REASONS.failed }
  }
}

export function ProductImages({
  productId,
  productName,
  categoryName,
  placeholder,
  images,
  next,
  readOnly,
}: ProductImagesProps) {
  const router = useRouter()
  const headingId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [lines, setLines] = useState<string[]>([])
  const [added, setAdded] = useState(false)
  const [announce, setAnnounce] = useState("")
  const [stale, setStale] = useState(false)
  // The row to focus once the refreshed order has rendered
  const focusRow = useRef<string | null>(null)
  const [removing, setRemoving] = useState<Photo | null>(null)

  // After a move the row is a different node: put focus back on it
  const orderKey = images.map((image) => image.id).join(",")
  useEffect(() => {
    if (!focusRow.current) return
    document.getElementById(`photo-row-${focusRow.current}`)?.focus()
    focusRow.current = null
  }, [orderKey])

  async function onPick(files: FileList | null) {
    if (!files || files.length === 0 || readOnly || busy) return
    const picked = Array.from(files)
    const plan = planUploads(picked, images.length)
    const results: string[] = new Array(picked.length)
    for (const { index, reason } of plan.refused) {
      results[index] = IMAGE_UI.refused(picked[index].name, reason)
    }
    setBusy(true)
    setStale(false)
    setAdded(false)
    let anyAdded = false
    for (const [step, index] of plan.accepted.entries()) {
      setProgress(IMAGE_UI.progress(step + 1, plan.accepted.length))
      const answer = await uploadOne(productId, picked[index])
      if (answer.ok) anyAdded = true
      results[index] = uploadLine(picked[index].name, answer)
    }
    setProgress(null)
    setLines(results.filter(Boolean))
    setAdded(anyAdded)
    setBusy(false)
    if (inputRef.current) inputRef.current.value = ""
    router.refresh()
  }

  async function reorder(order: string[], message: string, rowId: string) {
    if (readOnly || busy) return
    setBusy(true)
    setStale(false)
    try {
      const answer = await reorderProductImagesAction({ productId, order })
      if (!answer.ok) {
        setAnnounce(answer.message)
      } else if (answer.data.kind === "stale") {
        setStale(true)
      } else if (answer.data.kind === "saved") {
        setAnnounce(message)
        focusRow.current = rowId
        router.refresh()
      } else if (answer.data.kind === "not-found") {
        setAnnounce(IMAGE_REASONS.notFound)
      }
    } catch {
      setAnnounce(IMAGE_UI.failed)
    } finally {
      setBusy(false)
    }
  }

  async function confirmRemove(photo: Photo) {
    setBusy(true)
    setStale(false)
    try {
      const answer = await removeProductImageAction({
        productId,
        imageId: photo.id,
        shown: images.map((image) => image.id),
      })
      if (!answer.ok) {
        setAnnounce(answer.message)
      } else if (answer.data.kind === "removed") {
        setAnnounce(IMAGE_UI.removed)
        router.refresh()
      } else if (answer.data.kind === "stale") {
        setStale(true)
      } else {
        setAnnounce(IMAGE_REASONS.notFound)
      }
    } catch {
      setAnnounce(IMAGE_UI.failed)
    } finally {
      setBusy(false)
      setRemoving(null)
    }
  }

  const ids = images.map((image) => image.id)
  return (
    <section
      aria-labelledby={headingId}
      className="flex max-w-4xl flex-col gap-4 border-t pt-6"
    >
      <h2 id={headingId} className="text-lg font-semibold">
        {IMAGE_UI.heading}
      </h2>
      {readOnly ? (
        <p className="rounded-md border p-3 text-sm">{IMAGE_UI.readOnly}</p>
      ) : null}

      {images.length === 0 ? (
        <div className="flex items-center gap-4 rounded-md border border-dashed p-4">
          <ProductImage
            image={placeholder}
            productName={productName}
            sizes="96px"
            className="size-24 shrink-0"
          />
          <p className="text-sm text-muted-foreground">
            {IMAGE_UI.empty(categoryName)}
          </p>
        </div>
      ) : (
        <ol className="flex flex-col gap-3">
          {images.map((photo, i) => (
            <PhotoRow
              // Remount when the saved alt text changes, so the draft resets
              key={`${photo.id}-${photo.alt}`}
              photo={photo}
              position={i}
              count={images.length}
              productName={productName}
              disabled={readOnly || busy}
              onMoveUp={() =>
                reorder(moveUp(ids, i), IMAGE_UI.moved(i), photo.id)
              }
              onMoveDown={() =>
                reorder(moveDown(ids, i), IMAGE_UI.moved(i + 2), photo.id)
              }
              onMakeMain={() =>
                reorder(makeMain(ids, i), IMAGE_UI.mainChanged, photo.id)
              }
              onRemove={() => setRemoving(photo)}
              onSaved={(text) => {
                setAnnounce(text)
                router.refresh()
              }}
              onStale={() => setStale(true)}
            />
          ))}
        </ol>
      )}

      {stale ? (
        <div role="alert" className="flex items-center gap-3 text-sm">
          <p>{IMAGE_UI.stale}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setStale(false)
              router.refresh()
            }}
          >
            {IMAGE_UI.reload}
          </Button>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${headingId}-files`}>{IMAGE_UI.uploadLabel}</Label>
        <Input
          ref={inputRef}
          id={`${headingId}-files`}
          type="file"
          multiple
          // A hint only; the server decides from the bytes
          accept="image/jpeg,image/png,image/webp"
          disabled={readOnly || busy}
          aria-describedby={`${headingId}-hint`}
          onChange={(event) => void onPick(event.target.files)}
        />
        <p id={`${headingId}-hint`} className="text-xs text-muted-foreground">
          {IMAGE_UI.hint}
        </p>
        {progress ? <p className="text-sm font-medium">{progress}</p> : null}
        {lines.length > 0 ? (
          <ul className="flex flex-col gap-1 text-sm">
            {lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : null}
        {added ? (
          <div className="flex flex-col gap-1 rounded-md border p-3 text-sm">
            <p className="font-medium">{IMAGE_UI.done}</p>
            {next ? (
              <Link
                href={`/admin/products/${encodeURIComponent(next.id)}`}
                className={cn("w-fit underline underline-offset-4", focusRing)}
              >
                {IMAGE_UI.nextProduct(next.name)}
              </Link>
            ) : (
              <p>{IMAGE_UI.allDone}</p>
            )}
          </div>
        ) : null}
      </div>

      <p aria-live="polite" className="sr-only">
        {announce}
      </p>

      <Dialog
        open={removing !== null}
        onOpenChange={(open) => {
          // A close while the request runs is ignored
          if (!open && !busy) setRemoving(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{IMAGE_UI.removeTitle}</DialogTitle>
            <DialogDescription>
              {IMAGE_UI.removeBody}
              {images.length === 1
                ? ` ${IMAGE_UI.removeLast(categoryName)}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          {removing ? (
            <ProductImage
              image={removing}
              productName={productName}
              sizes="160px"
              className="size-40"
            />
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setRemoving(null)}
            >
              {IMAGE_UI.cancel}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={() => removing && void confirmRemove(removing)}
            >
              {IMAGE_UI.removeConfirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}

function PhotoRow({
  photo,
  position,
  count,
  productName,
  disabled,
  onMoveUp,
  onMoveDown,
  onMakeMain,
  onRemove,
  onSaved,
  onStale,
}: {
  photo: Photo
  position: number
  count: number
  productName: string
  disabled: boolean
  onMoveUp: () => void
  onMoveDown: () => void
  onMakeMain: () => void
  onRemove: () => void
  onSaved: (message: string) => void
  onStale: () => void
}) {
  const id = useId()
  const [alt, setAlt] = useState(photo.alt)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const n = position + 1
  const changed = alt !== photo.alt

  async function saveAlt() {
    const checked = validateAlt(alt)
    if (!checked.ok) {
      setError(
        checked.error === "empty" ? IMAGE_UI.altEmpty : IMAGE_UI.altTooLong
      )
      return
    }
    setError(null)
    setSaving(true)
    try {
      const answer = await setImageAltAction({ imageId: photo.id, alt })
      if (!answer.ok) {
        setError(answer.message)
      } else if (answer.data.kind === "saved") {
        onSaved(IMAGE_UI.altSaved)
      } else if (answer.data.kind === "invalid") {
        setError(
          answer.data.error === "empty"
            ? IMAGE_UI.altEmpty
            : IMAGE_UI.altTooLong
        )
      } else if (answer.data.kind === "not-found") {
        onStale()
      }
    } catch {
      setError(IMAGE_UI.failed)
    } finally {
      setSaving(false)
    }
  }

  return (
    <li
      id={`photo-row-${photo.id}`}
      tabIndex={-1}
      className="flex flex-wrap items-start gap-4 rounded-md border p-3 outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      <ProductImage
        image={photo}
        productName={productName}
        sizes="96px"
        className="size-24 shrink-0"
      />
      <div className="flex min-w-64 flex-1 flex-col gap-2">
        {position === 0 ? (
          <span className="w-fit rounded border px-1.5 py-0.5 text-xs font-medium">
            {IMAGE_UI.mainBadge}
          </span>
        ) : null}
        <Label htmlFor={`${id}-alt`}>{IMAGE_UI.altLabel}</Label>
        <div className="flex items-start gap-2">
          <Input
            id={`${id}-alt`}
            value={alt}
            maxLength={1000}
            disabled={disabled || saving}
            aria-invalid={Boolean(error)}
            aria-describedby={`${id}-help${error ? ` ${id}-error` : ""}`}
            onChange={(event) => {
              setAlt(event.target.value)
              setError(null)
            }}
          />
          {changed ? (
            <Button
              type="button"
              disabled={disabled || saving}
              onClick={() => void saveAlt()}
            >
              {IMAGE_UI.buttons.saveAlt}
            </Button>
          ) : null}
        </div>
        <p id={`${id}-help`} className="text-xs text-muted-foreground">
          {IMAGE_UI.altHelp}
        </p>
        {error ? (
          <p id={`${id}-error`} className="text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {position > 0 ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            aria-label={IMAGE_UI.moveUp(n)}
            onClick={onMoveUp}
          >
            {IMAGE_UI.buttons.moveUp}
          </Button>
        ) : null}
        {position < count - 1 ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            aria-label={IMAGE_UI.moveDown(n)}
            onClick={onMoveDown}
          >
            {IMAGE_UI.buttons.moveDown}
          </Button>
        ) : null}
        {position > 0 ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            aria-label={IMAGE_UI.makeMain(n)}
            onClick={onMakeMain}
          >
            {IMAGE_UI.buttons.makeMain}
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          aria-label={IMAGE_UI.remove(n)}
          onClick={onRemove}
        >
          {IMAGE_UI.buttons.remove}
        </Button>
      </div>
    </li>
  )
}
