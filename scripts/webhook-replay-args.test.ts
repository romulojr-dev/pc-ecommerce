import { describe, expect, it } from "vitest"

import {
  LOCAL_ONLY,
  parseReplayArgs,
  REPLAY_USAGE,
  replayBody,
} from "./webhook-replay-args"

// docs/specs/032-payment-webhooks: W1–W4 (W5, the missing token, is the
// script's own check)

const SESSION = "ps-0123456789abcdef01234567"

describe("parseReplayArgs", () => {
  it("posts a completed event to localhost:3000 by default (W1)", () => {
    expect(parseReplayArgs([SESSION])).toEqual({
      ok: true,
      sessionId: SESSION,
      event: "payment_session.completed",
      endpoint: "http://localhost:3000/api/webhooks/xendit",
    })
  })

  it("takes the event and a local URL (W2)", () => {
    expect(
      parseReplayArgs([
        SESSION,
        "--event",
        "expired",
        "--url",
        "http://127.0.0.1:3001",
      ])
    ).toEqual({
      ok: true,
      sessionId: SESSION,
      event: "payment_session.expired",
      endpoint: "http://127.0.0.1:3001/api/webhooks/xendit",
    })
  })

  it.each(["http://[::1]:3000", "http://localhost:4000/anything"])(
    "allows %s",
    (url) => {
      expect(parseReplayArgs([SESSION, "--url", url]).ok).toBe(true)
    }
  )

  it.each([
    "https://pcsilicon.example",
    "http://192.168.1.5:3000",
    "https://localhost:3000",
    "http://localhost.example.com",
    "not a url",
  ])("refuses %s before sending (W3)", (url) => {
    expect(parseReplayArgs([SESSION, "--url", url])).toEqual({
      ok: false,
      message: LOCAL_ONLY,
    })
  })

  it.each([
    [[]],
    [["abc"]],
    [[SESSION, "--event", "paid"]],
    [[SESSION, "--url"]],
    [[SESSION, SESSION]],
  ])("prints the usage for %j (W4)", (argv) => {
    expect(parseReplayArgs(argv)).toEqual({ ok: false, message: REPLAY_USAGE })
  })
})

describe("replayBody", () => {
  it("is a session webhook in Xendit's shape", () => {
    expect(
      replayBody(
        "payment_session.completed",
        SESSION,
        new Date("2026-11-01T07:05:00Z")
      )
    ).toEqual({
      event: "payment_session.completed",
      business_id: "replay",
      created: "2026-11-01T07:05:00.000Z",
      data: { payment_session_id: SESSION, status: "COMPLETED" },
    })
  })
})
