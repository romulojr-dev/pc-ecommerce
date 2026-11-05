import { describe, expect, test } from "vitest"

import {
  describeCreate,
  describeDemo,
  describeDisable,
  describeEnable,
  describePassword,
  staffMessages,
} from "./staff-messages"

// docs/specs/039-staff-sign-in-admin-shell, §5 (the scripts' copy)

describe("the scripts' lines", () => {
  test("the host line, and the outcomes with their exit codes", () => {
    expect(staffMessages.hostLine("localhost")).toBe("Database: localhost")
    expect(
      describeCreate({ status: "created", userId: "x" }, "STAFF", "a@b.co")
    ).toEqual({ text: "Created staff a@b.co.", exit: 0 })
    expect(describeCreate({ status: "exists" }, "OWNER", "a@b.co")).toEqual({
      text: "a@b.co already exists. Use --enable to re-enable it.",
      exit: 1,
    })
    expect(
      describePassword({ status: "changed", sessions: 2 }, "a@b.co")
    ).toEqual({
      text: "Changed the password for a@b.co and ended 2 session(s).",
      exit: 0,
    })
    expect(describePassword({ status: "not-found" }, "a@b.co")).toEqual({
      text: "No user with email a@b.co.",
      exit: 1,
    })
    expect(
      describeDisable({ status: "disabled", sessions: 1 }, "a@b.co")
    ).toEqual({ text: "Disabled a@b.co and ended 1 session(s).", exit: 0 })
    expect(describeDisable({ status: "already-disabled" }, "a@b.co")).toEqual({
      text: "a@b.co is already disabled.",
      exit: 0,
    })
    expect(describeEnable({ status: "enabled" }, "a@b.co")).toEqual({
      text: "Enabled a@b.co.",
      exit: 0,
    })
  })

  test("the demo lines", () => {
    expect(describeDemo({ status: "created", userId: "x" }).text).toBe(
      "Created the demo account."
    )
    expect(describeDemo({ status: "exists" })).toEqual({
      text: "The demo account already exists; left as it is.",
      exit: 0,
    })
    expect(staffMessages.demoSkipped).toBe(
      "DEMO_ACCOUNT_PASSWORD is not set; skipped the demo account."
    )
  })

  test("a weak password carries its message and exits non-zero", () => {
    const message = "The password must be at least 12 characters."
    expect(
      describeCreate({ status: "weak-password", message }, "STAFF", "a@b.co")
    ).toEqual({ text: message, exit: 1 })
    expect(describeDemo({ status: "weak-password", message }).exit).toBe(1)
  })
})
