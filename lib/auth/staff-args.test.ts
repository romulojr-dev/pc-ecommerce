import { describe, expect, test } from "vitest"

import { parseStaffArgs } from "./staff-args"

// docs/specs/039-staff-sign-in-admin-shell, U11

const ok = (value: unknown) => ({ ok: true, value })

describe("staff:create", () => {
  test("a full command", () => {
    expect(
      parseStaffArgs("create", [
        "--email",
        "Ana@Example.com",
        "--name",
        "Ana Cruz",
        "--role",
        "owner",
      ])
    ).toEqual(
      ok({
        command: "create",
        email: "ana@example.com",
        name: "Ana Cruz",
        role: "OWNER",
        production: false,
      })
    )
  })

  test("--option=value works and --production is read", () => {
    expect(
      parseStaffArgs("create", [
        "--email=b@example.com",
        "--name=Ben",
        "--role=staff",
        "--production",
      ])
    ).toEqual(
      ok({
        command: "create",
        email: "b@example.com",
        name: "Ben",
        role: "STAFF",
        production: true,
      })
    )
  })

  test("--role demo is refused and points to the seed", () => {
    const result = parseStaffArgs("create", [
      "--email",
      "d@example.com",
      "--name",
      "D",
      "--role",
      "demo",
    ])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toContain("db:seed --accounts-only")
  })

  test("an unknown role is refused", () => {
    const result = parseStaffArgs("create", [
      "--email",
      "d@example.com",
      "--name",
      "D",
      "--role",
      "admin",
    ])
    expect(result.ok).toBe(false)
  })

  test.each([
    [["--name", "A", "--role", "staff"], "--email is required."],
    [["--email", "a@example.com", "--role", "staff"], "--name is required."],
    [["--email", "a@example.com", "--name", "A"], "--role is required."],
    [
      ["--email", "not-an-email", "--name", "A", "--role", "staff"],
      "--email must be an email address.",
    ],
    [["--email"], "--email needs a value."],
  ])("%j is refused: %s", (argv, message) => {
    const result = parseStaffArgs("create", argv)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toContain(message)
  })

  test("--enable takes only an email", () => {
    expect(
      parseStaffArgs("create", ["--email", "a@example.com", "--enable"])
    ).toEqual(
      ok({ command: "enable", email: "a@example.com", production: false })
    )
    expect(
      parseStaffArgs("create", [
        "--email",
        "a@example.com",
        "--enable",
        "--role",
        "owner",
      ]).ok
    ).toBe(false)
  })
})

describe("no password option exists", () => {
  test.each([
    [
      "create",
      [
        "--email",
        "a@example.com",
        "--name",
        "A",
        "--role",
        "staff",
        "--password",
        "x",
      ],
    ],
    ["set-password", ["--email", "a@example.com", "--password=hunter2hunter2"]],
    [
      "create",
      ["--email", "a@example.com", "--name", "A", "--role", "staff", "-p", "x"],
    ],
  ] as const)("%s %j", (command, argv) => {
    const result = parseStaffArgs(command, [...argv])
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).toMatch(/Unknown option: (--password|-p)/)
      // Not even the value that was passed is echoed
      expect(result.message).not.toContain("hunter2hunter2")
    }
  })
})

describe("set-password and disable", () => {
  test("take an email and --production only", () => {
    for (const command of ["set-password", "disable"] as const) {
      expect(parseStaffArgs(command, ["--email", "a@example.com"])).toEqual(
        ok({ command, email: "a@example.com", production: false })
      )
      expect(
        parseStaffArgs(command, ["--email", "a@example.com", "--production"])
      ).toEqual(ok({ command, email: "a@example.com", production: true }))
      expect(
        parseStaffArgs(command, ["--email", "a@example.com", "--name", "x"]).ok
      ).toBe(false)
      expect(
        parseStaffArgs(command, ["--email", "a@example.com", "--enable"]).ok
      ).toBe(false)
    }
  })

  test("a refusal carries the command's usage", () => {
    const result = parseStaffArgs("disable", [])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toContain("pnpm staff:disable")
  })
})
