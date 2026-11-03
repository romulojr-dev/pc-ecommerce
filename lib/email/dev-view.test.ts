import { describe, expect, it } from "vitest"

import {
  DEV_EMAILS_SANDBOX,
  devEmailsEnabled,
  frameDocument,
  linkify,
} from "./dev-view"

// docs/specs/036-order-emails: V5 (the guard), V6 and V8 (the frame), and the
// text version's links.

describe("devEmailsEnabled", () => {
  it.each([
    ["fake", undefined, true],
    ["fake", "", true],
    ["fake", "preview", true],
    ["fake", "development", true],
    // V5: not the recording transport, or Production
    ["resend", undefined, false],
    ["resend", "preview", false],
    [undefined, undefined, false],
    ["fake", "production", false],
    ["resend", "production", false],
  ])("transport %s, VERCEL_ENV %s: %s", (transport, vercelEnv, expected) => {
    expect(devEmailsEnabled(transport, vercelEnv)).toBe(expected)
  })
})

describe("the frame", () => {
  it("V8: lets a link open a new tab and nothing else", () => {
    expect(DEV_EMAILS_SANDBOX).toBe(
      "allow-popups allow-popups-to-escape-sandbox"
    )
    for (const forbidden of [
      "allow-scripts",
      "allow-same-origin",
      "allow-top-navigation",
      "allow-forms",
    ]) {
      expect(DEV_EMAILS_SANDBOX).not.toContain(forbidden)
    }
  })

  it("adds a base target after the head, leaving the email as it is", () => {
    const html =
      '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"></head><body><a href="https://x.test/a">go</a></body></html>'

    const framed = frameDocument(html)

    expect(framed).toContain('<head><base target="_blank"><meta charset')
    expect(framed.replace('<base target="_blank">', "")).toBe(html)
  })

  it("copes with a head that has attributes, and with no head at all", () => {
    expect(frameDocument('<html><head data-x="1"><title>t</title>')).toContain(
      '<head data-x="1"><base target="_blank"><title>'
    )
    expect(frameDocument("<p>hi</p>")).toBe('<base target="_blank"><p>hi</p>')
  })
})

describe("linkify", () => {
  it("splits text from the URLs in it", () => {
    const url = "http://localhost:3000/orders/PCS-7KQ2M9XD?sig=abc&exp=1&p=view"

    expect(linkify(`Pay now ${url}\n\nView it: ${url}.`)).toEqual([
      { text: "Pay now " },
      { href: url },
      { text: "\n\nView it: " },
      { href: url },
      { text: "." },
    ])
  })

  it("keeps trailing punctuation out of the link", () => {
    expect(linkify("(see https://pcsilicon.tech/)")).toEqual([
      { text: "(see " },
      { href: "https://pcsilicon.tech/" },
      { text: ")" },
    ])
  })

  it("leaves text with no URL, and non-http schemes, alone", () => {
    expect(linkify("Total ₱23,110.00")).toEqual([{ text: "Total ₱23,110.00" }])
    expect(linkify("javascript:alert(1) data:text/html,x")).toEqual([
      { text: "javascript:alert(1) data:text/html,x" },
    ])
    expect(linkify("")).toEqual([])
  })
})
