import { test as base, expect } from "@playwright/test"

// Specs import `test` and `expect` from here, not from @playwright/test (the
// ESLint config enforces it), so every test fails when React warns about
// missing keys. React only runs that check in development, and the page still
// looks right, so nothing else would notice it (issue #44).
const KEY_WARNING = /unique "key" prop/

export const test = base.extend<{ reactKeyWarnings: void }>({
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
})

export { expect }
