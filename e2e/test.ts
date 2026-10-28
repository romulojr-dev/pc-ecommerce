import { test as base, expect } from "@playwright/test"

// Specs import `test` and `expect` from here, not from @playwright/test (the
// ESLint config enforces it), so every test fails when React warns about
// missing keys. React only runs that check in development, and the page still
// looks right, so nothing else would notice it (issue #44).
const KEY_WARNING = /unique "key" prop/

// A hydration mismatch (docs/specs/020-builder-page, D14). React reports it
// in development by message, and in production builds as minified errors
// #418, #423 and #425, either logged or thrown as an uncaught page error, so
// CI's production build catches it too.
const HYDRATION_ERROR =
  /Hydration failed|didn't match the client|hydrat\w* .*mismatch|Minified React error #(418|423|425)/i

export const test = base.extend<{
  reactKeyWarnings: void
  hydrationErrors: void
}>({
  reactKeyWarnings: [
    async ({ context }, use) => {
      const warnings: string[] = []
      context.on("console", (message) => {
        if (message.type() === "error" && KEY_WARNING.test(message.text())) {
          warnings.push(message.text())
        }
      })
      await use()
      expect(warnings, "React logged a key warning").toEqual([])
    },
    { auto: true },
  ],
  hydrationErrors: [
    async ({ context }, use) => {
      const errors: string[] = []
      context.on("console", (message) => {
        if (
          message.type() === "error" &&
          HYDRATION_ERROR.test(message.text())
        ) {
          errors.push(message.text())
        }
      })
      context.on("weberror", (webError) => {
        const text = String(webError.error())
        if (HYDRATION_ERROR.test(text)) errors.push(text)
      })
      await use()
      expect(errors, "React reported a hydration mismatch").toEqual([])
    },
    { auto: true },
  ],
})

export { expect }
