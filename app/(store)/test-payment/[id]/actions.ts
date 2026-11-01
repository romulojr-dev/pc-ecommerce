"use server"

import { z } from "zod"

import { chooseOnFakePage, type FakeChoice } from "@/lib/payments/fake-page"

// The fake payment page's buttons (docs/specs/031-pay-with-xendit, Behavior
// 15). Public POST endpoints like every action, so each one opens the page
// again with its own checks (the gateway is the fake, the key opens the
// session's order) and does nothing on a miss. They only exist where
// PAYMENT_GATEWAY is fake; elsewhere every call is a miss.

const inputSchema = z.object({ id: z.string(), key: z.string() })

export type FakeChoiceResult = { ok: true; url: string } | { ok: false }

async function choose(
  choice: FakeChoice,
  input: unknown
): Promise<FakeChoiceResult> {
  const parsed = inputSchema.safeParse(input)
  if (!parsed.success) return { ok: false }
  const url = await chooseOnFakePage(choice, parsed.data.id, parsed.data.key)
  return url ? { ok: true, url } : { ok: false }
}

export async function payFakeAction(input: unknown) {
  return choose("pay", input)
}

export async function cancelFakeAction(input: unknown) {
  return choose("cancel", input)
}

export async function expireFakeAction(input: unknown) {
  return choose("expire", input)
}
