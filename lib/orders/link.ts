// The order link (docs/specs/030-place-an-order, Behavior 16): the number in
// the path, the secret token in the query. The only place the token appears
// as text. Pure.
export function orderLink(orderNumber: string, accessToken: string): string {
  return `/orders/${orderNumber}?key=${accessToken}`
}
