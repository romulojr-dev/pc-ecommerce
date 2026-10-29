import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, test } from "vitest"

import {
  type CopyState,
  ShareDialogBody,
  type SharePhase,
} from "./share-dialog-body"

// The share dialog's contents (docs/specs/022-share-build, Behavior 4–7;
// E40–E45). Clicking, copying and focus are in the E2E tests.

const URL_OF = "http://localhost:3000/builds/abcde12345"

function render(phase: SharePhase, copy: CopyState = "idle") {
  return renderToStaticMarkup(
    <ShareDialogBody
      phase={phase}
      copy={copy}
      onCopy={() => {}}
      onRetry={() => {}}
    />
  )
}

describe("ShareDialogBody", () => {
  test("says it is creating the link, and is busy (E40)", () => {
    const html = render({ kind: "creating" })
    expect(html).toContain("Creating your link…")
    expect(html).toContain('aria-busy="true"')
    expect(html).not.toContain("Copy link")
  })

  test("shows the link in a read-only, labelled field with a Copy link button (E40)", () => {
    const html = render({ kind: "created", url: URL_OF })
    expect(html).toContain('aria-busy="false"')
    expect(html).toContain('for="share-link"')
    expect(html).toContain("Share link")
    expect(html).toMatch(/<input[^>]*id="share-link"[^>]*readonly[^>]*/i)
    expect(html).toContain(`value="${URL_OF}"`)
    expect(html).toContain("Copy link")
    expect(html).toContain(
      "This link shows these parts. Prices and stock are always up to date."
    )
  })

  test("keeps an empty status region, so a new line is announced (E41)", () => {
    const html = render({ kind: "created", url: URL_OF })
    expect(html).toMatch(/<p role="status"[^>]*><\/p>/)
  })

  test("says the link was copied, in the status region (E41)", () => {
    const html = render({ kind: "created", url: URL_OF }, "copied")
    expect(html).toMatch(/<p role="status"[^>]*>Link copied<\/p>/)
  })

  test("says what to do when copying fails (E42)", () => {
    const html = render({ kind: "created", url: URL_OF }, "failed")
    expect(html).toMatch(
      /<p role="status"[^>]*>Couldn’t copy the link\. Select it and copy it yourself\.<\/p>/
    )
  })

  test("shows an error as an alert with Try again (E45, E46)", () => {
    const html = render({
      kind: "error",
      message: "We couldn't create a link. Try again.",
    })
    expect(html).toContain('role="alert"')
    expect(html).toContain("We couldn&#x27;t create a link. Try again.")
    expect(html).toContain("Try again</button>")
    expect(html).not.toContain("Copy link")
  })
})
