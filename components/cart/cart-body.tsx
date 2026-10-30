import { CartEmpty } from "@/components/cart/cart-empty"
import { CartGroup } from "@/components/cart/cart-group"
import { CartLine, type LineMessage } from "@/components/cart/cart-line"
import { CartSummary } from "@/components/cart/cart-summary"
import type { CartView } from "@/lib/cart/types"

type CartBodyProps = {
  view: CartView
  // Line ids with a change running, and what each line says under itself
  busy: ReadonlySet<string>
  messages: Readonly<Record<string, LineMessage | undefined>>
  // What the page announces after a removal or a missing line
  status: string
  onQuantity: (lineId: string, quantity: number) => void
  onSetTo: (lineId: string, quantity: number) => void
  onRemove: (lineId: string) => void
  onRemoveGroup: (buildId: string) => void
}

// The cart page's content (docs/specs/025-cart-single-items, Behavior 17–23):
// the lines and the summary, or the empty state, under one status region that
// is in the page before anything is said. Presentational: CartContent owns
// the state and calls the actions.
export function CartBody({
  view,
  busy,
  messages,
  status,
  onQuantity,
  onSetTo,
  onRemove,
  onRemoveGroup,
}: CartBodyProps) {
  return (
    <>
      <p role="status" className="min-h-5 text-sm text-muted-foreground">
        {status}
      </p>
      {view.entries.length === 0 ? (
        <CartEmpty />
      ) : (
        <div className="grid items-start gap-8 lg:grid-cols-[1fr_20rem]">
          <ul className="divide-y border-y">
            {view.entries.map((entry) =>
              entry.kind === "build" ? (
                <CartGroup
                  key={entry.buildId}
                  group={entry}
                  busy={busy.has(entry.buildId)}
                  message={messages[entry.buildId] ?? null}
                  onRemove={() => onRemoveGroup(entry.buildId)}
                />
              ) : (
                <CartLine
                  key={entry.id}
                  line={entry}
                  busy={busy.has(entry.id)}
                  message={messages[entry.id] ?? null}
                  onQuantity={(quantity) => onQuantity(entry.id, quantity)}
                  onSetTo={(quantity) => onSetTo(entry.id, quantity)}
                  onRemove={() => onRemove(entry.id)}
                />
              )
            )}
          </ul>
          <CartSummary count={view.count} subtotal={view.subtotal} />
        </div>
      )}
    </>
  )
}
