import "server-only"

// What /dev/emails needs that has no database in it (docs/specs/036-order-
// emails, Behavior 14–15, §4 /dev/emails): when the page exists, how a stored
// email is put in its frame, and how its text version gets links. Pure, so
// the unit tests need no server.

export const DEV_EMAILS_COPY = {
  title: "Test emails",
  note: "Demo data. These are the emails the fake transport recorded.",
  empty: "No emails yet.",
  to: "To",
  from: "From",
  sent: "Sent",
  html: "HTML",
  text: "Text",
} as const

// The newest emails the page lists
export const DEV_EMAILS_LIMIT = 50

// The frame's sandbox: no scripts, no same-origin access and no top-level
// navigation, so a stored email can neither run code nor replace this page;
// a link may open a new tab (allow-popups), and that tab is an ordinary page
// (allow-popups-to-escape-sandbox), where the order page's own scripts work.
export const DEV_EMAILS_SANDBOX = "allow-popups allow-popups-to-escape-sandbox"

// Only with the recording transport, and never in Production. The environment
// schema already refuses `fake` in Production; the second check guards against
// a misconfiguration slipping through.
export const devEmailsEnabled = (
  transport: string | undefined,
  vercelEnv: string | undefined
): boolean => transport === "fake" && vercelEnv !== "production"

// The email's own document with `<base target="_blank">`, so every link opens
// in a new tab. The stored email is not changed.
export function frameDocument(html: string): string {
  const base = '<base target="_blank">'
  const head = /<head[^>]*>/i.exec(html)
  if (head) {
    const end = head.index + head[0].length
    return html.slice(0, end) + base + html.slice(end)
  }
  return base + html
}

export type TextPart = { text: string } | { href: string }

// Splits a plain-text email into text and bare URLs (http and https only), so
// the page can link the URLs. Trailing punctuation stays out of the link.
export function linkify(text: string): TextPart[] {
  const parts: TextPart[] = []
  let last = 0
  for (const match of text.matchAll(/https?:\/\/[^\s<>"']+/g)) {
    const href = match[0].replace(/[.,;:!?)]+$/, "")
    if (match.index > last) parts.push({ text: text.slice(last, match.index) })
    parts.push({ href })
    last = match.index + href.length
  }
  if (last < text.length) parts.push({ text: text.slice(last) })
  return parts
}
