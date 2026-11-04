// The address part of EMAIL_FROM (docs/specs/038-cash-on-delivery, Behavior
// 25): `PC Silicon <orders@mail.pcsilicon.tech>` and a bare
// `orders@mail.pcsilicon.tech` both give the address, never the display name,
// so the order page can tell a shopper where to look. Pure.
export function senderAddress(from: string): string {
  const angle = /<([^<>]*)>\s*$/.exec(from)
  return (angle ? angle[1] : from).trim()
}
