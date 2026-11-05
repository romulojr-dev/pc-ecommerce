import { ESLint } from "eslint"
import { describe, expect, test } from "vitest"

// docs/specs/040-admin-permissions-audit-masking, R9a, T1: fixtures prove the
// placement rules fire
const eslint = new ESLint()

async function ruleIds(filePath: string, code: string) {
  const [result] = await eslint.lintText(code, { filePath })
  return result.messages.map((m) => m.ruleId)
}

const GUARD_IMPORT = `import { adminAction } from "@/lib/admin/guard"\nexport const a = adminAction\n`
const DIRECTIVE = `"use server"\nexport async function a() {}\n`
const INLINE = `export default function P() {\n  async function f() {\n    "use server"\n  }\n  return f\n}\n`

describe("placement of admin mutations", { timeout: 30_000 }, () => {
  test("the guard may be imported by an admin actions.ts and route.ts", async () => {
    for (const file of [
      "app/admin/(shell)/orders/actions.ts",
      "app/api/admin/images/route.ts",
    ]) {
      expect(await ruleIds(file, GUARD_IMPORT), file).not.toContain(
        "no-restricted-imports"
      )
    }
  })

  test("anywhere else it may not", async () => {
    for (const file of [
      "app/(store)/cart/actions.ts",
      "app/admin/(shell)/orders/page.tsx",
      "components/admin/thing.tsx",
      "lib/cart/helper.ts",
    ]) {
      expect(await ruleIds(file, GUARD_IMPORT), file).toContain(
        "no-restricted-imports"
      )
    }
  })

  test("a use-server directive in the admin folders must be in an actions.ts", async () => {
    expect(
      await ruleIds("app/admin/(shell)/orders/actions.ts", DIRECTIVE)
    ).not.toContain("no-restricted-syntax")
    for (const file of [
      "app/admin/(shell)/orders/server.ts",
      "components/admin/save.ts",
      "lib/admin/save.ts",
      "app/api/admin/save/route.ts",
    ]) {
      expect(await ruleIds(file, DIRECTIVE), file).toContain(
        "no-restricted-syntax"
      )
    }
    expect(
      await ruleIds("app/admin/(shell)/orders/page.tsx", INLINE)
    ).toContain("no-restricted-syntax")
  })

  test("other folders keep their own use-server files", async () => {
    expect(
      await ruleIds("app/(store)/cart/actions.ts", DIRECTIVE)
    ).not.toContain("no-restricted-syntax")
  })
})
