// The order link (docs/specs/030-place-an-order, Behavior 16): the number in
// the path, the secret token in the query. The only place the token appears
// as text. Pure.
export function orderLink(orderNumber: string, accessToken: string): string {
  return `/orders/${orderNumber}?key=${accessToken}`
}

// The header the order status route reads the key from (docs/specs/031-pay-
// with-xendit, D11): never the URL, so request logs don't record it again
export const ORDER_KEY_HEADER = "X-Order-Key"

// The order link as the shopper should keep it: the page's address without
// the `payment=` value a return from the gateway adds (docs/specs/031-pay-
// with-xendit, Behavior 12)
export function savedOrderLink(href: string): string {
  const url = new URL(href)
  url.searchParams.delete("payment")
  return url.toString()
}
