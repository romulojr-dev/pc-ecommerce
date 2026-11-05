import { ESLint } from "eslint"
import { describe, expect, test } from "vitest"

// docs/specs/040-admin-permissions-audit-masking, R1: the pure admin files
// import no database, env, next or react. A fixture proves the rule fires.
const eslint = new ESLint()

async function messages(filePath: string, code: string) {
  const [result] = await eslint.lintText(code, { filePath })
  return result.messages.map((m) => m.ruleId)
}

describe("import limits on the pure admin files", { timeout: 30_000 }, () => {
  test.each([
    "lib/admin/permissions.ts",
    "lib/admin/mask.ts",
    "lib/admin/marker.ts",
  ])("%s may not import the database, env, next or react", async (file) => {
    for (const source of [
      "@/lib/db",
      "@/lib/env",
      "next/headers",
      "react",
      "server-only",
    ]) {
      const rules = await messages(
        file,
        `import x from "${source}"\nexport { x }\n`
      )
      expect(rules, `${file} importing ${source}`).toContain(
        "no-restricted-imports"
      )
    }
  })

  test("a plain import is fine", async () => {
    const rules = await messages(
      "lib/admin/permissions.ts",
      `import { z } from "zod"\nexport const a = z\n`
    )
    expect(rules).not.toContain("no-restricted-imports")
  })
})
