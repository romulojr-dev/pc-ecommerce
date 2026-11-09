import { renderToStaticMarkup } from "react-dom/server"
import { expect, test } from "vitest"

import { SiteFooter } from "./site-footer"

// The footer says the photos are for illustration (docs/specs/049-product-
// images-upload, B22, E39)
test("E39: the footer says it is a demo store and the images illustrate", () => {
  const html = renderToStaticMarkup(<SiteFooter />)
  expect(html).toContain(
    "PC Silicon is a demo store. Product images are for illustration."
  )
})
