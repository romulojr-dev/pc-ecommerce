import {
  IssueList,
  PowerLine,
  StatusLine,
} from "@/components/builder/summary-parts"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import type { BuildStatus, Issue, PowerEstimate } from "@/lib/builder"
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
}

// The builder's summary (docs/specs/020-builder-page, Behavior 15–16): total,
// estimated power, compatibility status and issues, availability, and the
// Add build to cart button that is coming with the Checkout epic. It shows
// no figure until the build has loaded.
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
      <div className="flex flex-col gap-2 border-t pt-4">
        <Button
          size="lg"
          disabled
          aria-describedby="build-cart-note"
          className="h-10 text-sm"
        >
          Add build to cart
        </Button>
        {/* Visible text, not a tooltip: disabled buttons can't be focused */}
        <p id="build-cart-note" className="text-sm text-muted-foreground">
          Adding a whole build to the cart is coming soon.
        </p>
      </div>
      <ShareButton {...props} />
    </aside>
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
        <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive dark:bg-destructive/20">
          {availability}
        </p>
      )}
    </>
  )
}
