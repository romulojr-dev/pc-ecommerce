import { FlaskConicalIcon } from "lucide-react"

import { STEP_COPY } from "@/lib/checkout/copy"

// FR-27: on every checkout step (docs/specs/029-checkout-steps, Behavior 6)
// and on a pending order's page, with the gateway's test instructions
// (docs/specs/031-pay-with-xendit, Behavior 6, §5). Plain text, no live
// region.
export function TestModeBanner({ instructions }: { instructions: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md bg-amber-500/10 p-3 text-sm text-amber-900 dark:bg-amber-500/15 dark:text-amber-200">
      <FlaskConicalIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <p>
        <strong>{STEP_COPY.banner}</strong> {STEP_COPY.bannerText}{" "}
        {instructions}
      </p>
    </div>
  )
}
