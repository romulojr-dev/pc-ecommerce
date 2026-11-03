import "server-only"

import { render } from "react-email"

import type { EmailContent } from "../templates"
import type { EmailView } from "../view"
import { EmailDocument } from "./layout"

// How the layout's tables read as text: each row a line, its cells apart
// ("Subtotal  ₱22,990.00"), and headings in the case they were written in.
const TEXT_OPTIONS = {
  selectors: [
    { selector: "tr", format: "block" },
    {
      selector: "td",
      format: "inlineSurround",
      options: { suffix: "  " },
    },
    { selector: "h2", format: "heading", options: { uppercase: false } },
  ],
}

// The layout's nested tables leave padding spaces and empty lines in the
// text; nothing in it is indented on purpose
export const tidyText = (text: string): string =>
  text
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()

// HTML and plain text from one tree (docs/specs/036-order-emails, D3). The
// plain-text renderer does not wrap lines, so a signed link is never split.
export async function renderEmail(view: EmailView): Promise<EmailContent> {
  const tree = <EmailDocument view={view} />
  const [html, text] = await Promise.all([
    render(tree),
    render(tree, { plainText: true, htmlToTextOptions: TEXT_OPTIONS }),
  ])
  return { subject: view.subject, html, text: tidyText(text) }
}
