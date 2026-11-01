import { env } from "@/lib/env"

import { fakeGateway } from "./fake"
import type { PaymentGateway } from "./gateway-types"
import type { PaymentEnvironment } from "./session-request"
import { xenditGateway } from "./xendit"

// The gateway this deployment uses (docs/specs/031-pay-with-xendit, §6;
// ADR 0010), chosen by PAYMENT_GATEWAY. lib/env.ts has already refused the
// fake in production, a live key anywhere, and xendit without a key or an
// https site.

let chosen: PaymentGateway | undefined

export function gateway(): PaymentGateway {
  chosen ??=
    env.PAYMENT_GATEWAY === "xendit"
      ? xenditGateway({ secretKey: env.XENDIT_SECRET_KEY ?? "" })
      : fakeGateway()
  return chosen
}

// The environment a session belongs to, in its metadata: #80 ignores
// sessions of another environment on the same test account
export const paymentEnvironment = (): PaymentEnvironment =>
  env.VERCEL_ENV ?? "development"
