import { env } from "@/lib/env"
import {
  credentialQuery,
  type OrderCredential,
  toCredential,
} from "@/lib/orders/credential"
import { findOrderByCredential } from "@/lib/orders/get-order"

import { CALLBACK_TOKEN_HEADER, handlePaymentEvent } from "./events"
import {
  completeFakeSession,
  expireFakeSession,
  type FakeSession,
  readFakeSession,
} from "./fake"
import { fakeSessionEvent, type FakeEventType } from "./fake-events"
import { paymentEnvironment } from "./gateway"
import type { PaymentGateway } from "./gateway-types"
import type { PaymentEnvironment, PaymentParam } from "./session-request"
import { SESSION_ID } from "./webhook"

// The fake payment page's logic (docs/specs/031-pay-with-xendit, Behavior
// 15–16, F1–F5). It stands in for Xendit's hosted page: Pay completes the
// session and sends a payment_session.completed event through the event
// seam, Cancel just goes back, Let it expire expires it and sends
// payment_session.expired. Every miss is null, so the page answers one 404:
// the gateway isn't the fake, the id is malformed or unknown, the key doesn't
// open the session's order, or the session belongs to another environment.

export type FakePageContext = {
  gatewayIsFake?: boolean
  environment?: PaymentEnvironment
  now?: Date
  // The gateway the webhook handler reads (tests pass the fake with a clock)
  gateway?: PaymentGateway
}

export type FakePage = {
  session: FakeSession
  orderNumber: string
  // The order link, built from the credential the page was opened with
  orderHref: string
}

export async function openFakePage(
  id: unknown,
  key: unknown,
  {
    gatewayIsFake = env.PAYMENT_GATEWAY === "fake",
    environment = paymentEnvironment(),
    now = new Date(),
  }: FakePageContext = {}
): Promise<FakePage | null> {
  if (!gatewayIsFake) return null
  if (typeof id !== "string" || !SESSION_ID.test(id)) return null
  const credential = toCredential(key)
  if (credential.kind !== "token" && credential.kind !== "link") return null

  const session = await readFakeSession(id, now)
  const metadata = session?.metadata ?? {}
  if (!session || metadata.environment !== environment) return null
  const order = await findOrderByCredential(
    metadata.order_number,
    credential,
    now
  )
  if (!order || order.id !== metadata.order_id) return null

  return {
    session,
    orderNumber: order.orderNumber,
    orderHref: orderHref(order.orderNumber, credential),
  }
}

const orderHref = (orderNumber: string, credential: OrderCredential) =>
  `/orders/${orderNumber}?${credentialQuery(credential)}`

const back = (page: FakePage, payment: PaymentParam) =>
  `${page.orderHref}&payment=${payment}`

// Runs the webhook handler in process and waits for it, so the return page
// already shows its result (docs/specs/032-payment-webhooks, behavior 25–26,
// D10). Called after the fake session's own write, never inside a
// transaction. A failed answer is in the handler's log line; the shopper
// still goes back, as after a lost webhook.
async function send(
  type: FakeEventType,
  session: FakeSession,
  now: Date,
  context: FakePageContext
) {
  await handlePaymentEvent(
    {
      headers: { [CALLBACK_TOKEN_HEADER]: env.XENDIT_WEBHOOK_TOKEN ?? "" },
      body: JSON.stringify(fakeSessionEvent(type, session, now)),
    },
    env.XENDIT_WEBHOOK_TOKEN,
    {
      reconcileOptions: {
        now,
        environment: context.environment,
        gateway: context.gateway,
      },
    }
  )
}

export type FakeChoice = "pay" | "cancel" | "expire"

// What a button does; the URL to go to, or null for a miss. A session that
// is no longer active goes back to the order without an event.
export async function chooseOnFakePage(
  choice: FakeChoice,
  id: unknown,
  key: unknown,
  context: FakePageContext = {}
): Promise<string | null> {
  const now = context.now ?? new Date()
  const page = await openFakePage(id, key, { ...context, now })
  if (!page) return null
  const sessionId = page.session.id

  if (choice === "pay") {
    const paid = await completeFakeSession(sessionId, now)
    if (!paid) return page.orderHref
    await send("payment_session.completed", paid, now, context)
    return back(page, "return")
  }
  if (choice === "expire") {
    const expired = await expireFakeSession(sessionId, now)
    if (!expired) return page.orderHref
    await send("payment_session.expired", expired, now, context)
  }
  return back(page, "cancelled")
}
