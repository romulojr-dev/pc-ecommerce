import { renderToStaticMarkup } from "react-dom/server"
import { expect, test } from "vitest"

import { CartLink } from "./cart-link"

// docs/specs/025-cart-single-items, Behavior 12, 15: the server render has no
// badge and the plain name, so it matches the first client render (the count
// is null until the route answers). The badge text and label rules are tested
// in lib/cart/count.test.ts.
test("the server render has no badge and the plain name", () => {
  const html = renderToStaticMarkup(<CartLink className="icon" />)

  expect(html).toContain('href="/cart"')
  expect(html).toContain('aria-label="Cart"')
  expect(html).toContain("icon")
  expect(html).not.toContain("tabular-nums")
})
