// The order link (docs/specs/030-place-an-order, Behavior 16): the number in
// the path, the secret token in the query. The only place the token appears
// as text. Pure.
export function orderLink(orderNumber: string, accessToken: string): string {
  return `/orders/${orderNumber}?key=${accessToken}`
}

// The header the order status route reads the key from (docs/specs/031-pay-
// with-xendit, D11): never the URL, so request logs don't record it again
export const ORDER_KEY_HEADER = "X-Order-Key"

// The header the status route reads a signed link from (docs/specs/035-email-
// foundation-signed-links, D12): the link's query string, never the URL
export const ORDER_LINK_HEADER = "X-Order-Link"

// The credential parameters of the page's address, as text: `key`, or `sig`,
// `exp` and `p`. Client-safe (no crypto); the server parses and checks them
// (lib/orders/credential.ts).
export type CredentialParams = {
  key: string | null
  sig: string | null
  exp: string | null
  p: string | null
}

export function credentialParamsOf(search: URLSearchParams): CredentialParams {
  return {
    key: search.get("key"),
    sig: search.get("sig"),
    exp: search.get("exp"),
    p: search.get("p"),
  }
}

// The status route's header for these parameters: the key, or the link's
// query string
export function credentialHeaders(
  params: CredentialParams
): Record<string, string> {
  if (params.key !== null) return { [ORDER_KEY_HEADER]: params.key }
  if (params.sig !== null && params.exp !== null && params.p !== null) {
    const link = new URLSearchParams({
      sig: params.sig,
      exp: params.exp,
      p: params.p,
    })
    return { [ORDER_LINK_HEADER]: link.toString() }
  }
  return {}
}

// The order link as the shopper should keep it: the page's address without
// the `payment=` value a return from the gateway adds (docs/specs/031-pay-
// with-xendit, Behavior 12)
export function savedOrderLink(href: string): string {
  const url = new URL(href)
  url.searchParams.delete("payment")
  return url.toString()
}
