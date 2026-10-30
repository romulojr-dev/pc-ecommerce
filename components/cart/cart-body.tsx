import { CartEmpty } from "@/components/cart/cart-empty"
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
  onRemove: (lineId: string) => void
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
  onRemove,
}: CartBodyProps) {
  return (
    <>
      <p role="status" className="min-h-5 text-sm text-muted-foreground">
        {status}
      </p>
      {view.lines.length === 0 ? (
        <CartEmpty />
      ) : (
        <div className="grid items-start gap-8 lg:grid-cols-[1fr_20rem]">
          <ul className="divide-y border-y">
            {view.lines.map((line) => (
              <CartLine
                key={line.id}
                line={line}
                busy={busy.has(line.id)}
                message={messages[line.id] ?? null}
                onQuantity={(quantity) => onQuantity(line.id, quantity)}
                onRemove={() => onRemove(line.id)}
              />
            ))}
          </ul>
          <CartSummary count={view.count} subtotal={view.subtotal} />
        </div>
      )}
    </>
  )
}
