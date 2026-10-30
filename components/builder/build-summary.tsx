import type { Ref } from "react"

import { BuildCartResult } from "@/components/builder/build-cart-result"
import {
  IssueList,
  PowerLine,
  StatusLine,
} from "@/components/builder/summary-parts"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import type { BuildStatus, Issue, PowerEstimate } from "@/lib/builder"
import {
  type BuildCartButton,
  cartButtonReasonText,
} from "@/lib/build-state/cart-button"
import type { BuildResultView } from "@/lib/cart/build-result"
import { formatPeso } from "@/lib/format"

export type BuildSummaryProps = {
  // loading: the saved build or its parts haven't loaded; error: the parts
  // request failed
  state: "loading" | "error" | "ready"
  isEmpty: boolean
  // Centavos
  total: number
  power: PowerEstimate
  status: BuildStatus
  issues: readonly Issue[]
  // The summary's line about parts that aren't buyable, or null
  availability: string | null
  onRetry: () => void
  // Share build is enabled when the build has parts and has loaded
  // (docs/specs/022-share-build, Behavior 1)
  canShare: boolean
  onShare: () => void
  // Add build to cart (docs/specs/026-add-build-to-cart, Behavior 1–5)
  cart: {
    button: BuildCartButton
    sending: boolean
    // What the line under the button says, or null
    result: BuildResultView | null
    onClick: () => void
  }
  // For the warnings dialog to return focus to
  cartButtonRef?: Ref<HTMLButtonElement>
}

// The id of the availability line, which the button points at when a part
// can't be bought
const AVAILABILITY_ID = "build-availability"
const noteId = (reason: string) => `build-cart-note-${reason}`

// The builder's summary (docs/specs/020-builder-page, Behavior 15–16): total,
// estimated power, compatibility status and issues, availability, and the
// Add build to cart button with its result. It shows no figure until the
// build has loaded.
export function BuildSummary(props: BuildSummaryProps) {
  return (
    <aside
      aria-labelledby="build-summary-heading"
      className="flex flex-col gap-5 rounded-lg border p-5 lg:sticky lg:top-6"
    >
      <h2 id="build-summary-heading" className="text-lg font-semibold">
        Your build
      </h2>
      <SummaryBody {...props} />
      <CartButton {...props} />
      <ShareButton {...props} />
    </aside>
  )
}

// Add build to cart. Disabled with its reasons as visible text (a disabled
// button can't be focused, so a tooltip would never be read): empty and
// errors have a line of their own, and a part that can't be bought points at
// the availability line above, which already names it (D12).
function CartButton({ cart, cartButtonRef }: BuildSummaryProps) {
  const { button, sending } = cart
  const texts = button.reasons.flatMap((reason) => {
    const text = cartButtonReasonText(reason)
    return text ? [{ reason, text }] : []
  })
  const describedBy = button.reasons
    .map((reason) =>
      cartButtonReasonText(reason) ? noteId(reason) : AVAILABILITY_ID
    )
    .join(" ")
  return (
    <div className="flex flex-col gap-2 border-t pt-4">
      <Button
        ref={cartButtonRef}
        size="lg"
        disabled={!button.enabled || sending}
        aria-busy={sending || undefined}
        aria-describedby={describedBy || undefined}
        className="h-10 text-sm"
        onClick={cart.onClick}
      >
        {sending ? "Adding…" : "Add build to cart"}
      </Button>
      {texts.map(({ reason, text }) => (
        <p
          key={reason}
          id={noteId(reason)}
          className="text-sm text-muted-foreground"
        >
          {text}
        </p>
      ))}
      <BuildCartResult view={cart.result} />
    </div>
  )
}

// Share build, under the cart button. Disabled with a visible reason for an
// empty build; while loading or after a load error the summary itself already
// says what is going on, so it stays disabled without a note.
function ShareButton({ state, isEmpty, canShare, onShare }: BuildSummaryProps) {
  const needsParts = state === "ready" && isEmpty
  return (
    <div className="flex flex-col gap-2">
      <Button
        size="lg"
        variant="outline"
        disabled={!canShare}
        aria-describedby={needsParts ? "build-share-note" : undefined}
        className="h-10 text-sm"
        onClick={onShare}
      >
        Share build
      </Button>
      {needsParts && (
        <p id="build-share-note" className="text-sm text-muted-foreground">
          Add parts to share your build.
        </p>
      )}
    </div>
  )
}

function SummaryBody({
  state,
  isEmpty,
  total,
  power,
  status,
  issues,
  availability,
  onRetry,
}: BuildSummaryProps) {
  if (state === "error") {
    return (
      <div role="alert" className="flex flex-col items-start gap-3">
        <p className="text-sm">
          We couldn&rsquo;t load your build&rsquo;s prices and stock.
        </p>
        <Button variant="outline" size="lg" onClick={onRetry}>
          Try again
        </Button>
      </div>
    )
  }
  if (state === "loading") {
    return (
      <div className="flex flex-col gap-3" aria-hidden="true">
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/3" />
      </div>
    )
  }

  return (
    <>
      <dl className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-sm text-muted-foreground">Total</dt>
          <dd className="text-2xl font-semibold tabular-nums">
            {formatPeso(total)}
          </dd>
        </div>
      </dl>
      <PowerLine power={power} />

      {isEmpty ? (
        <p className="text-sm text-muted-foreground">
          Add parts to check compatibility.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <StatusLine status={status} />
          <IssueList issues={issues} />
        </div>
      )}

      {availability && (
        <p
          id={AVAILABILITY_ID}
          className="rounded-md bg-destructive/10 p-3 text-sm text-destructive dark:bg-destructive/20"
        >
          {availability}
        </p>
      )}
    </>
  )
}
