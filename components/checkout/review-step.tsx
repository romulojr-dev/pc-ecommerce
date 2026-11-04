"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"

import {
  placeOrderAction,
  type ReviewActionResult,
  reviewCheckoutAction,
} from "@/app/(store)/checkout/actions"
import {
  PAYMENT_COD_ID,
  PAYMENT_ONLINE_ID,
} from "@/components/checkout/payment-choice"
import { PROBLEMS_HEADING_ID } from "@/components/checkout/problems-box"
import {
  DETAILS_HREF,
  type ReviewOk,
  ReviewView,
} from "@/components/checkout/review-view"
import {
  VOUCHER_INPUT_ID,
  VOUCHER_REMOVE_ID,
} from "@/components/checkout/voucher-box"
import { Button, buttonVariants } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  COD_COPY,
  codFallbackText,
  codReasonText,
  STEP_COPY,
  VOUCHER_COPY,
  voucherRefusalText,
} from "@/lib/checkout/copy"
import { type CheckoutDraft, draftPayload } from "@/lib/checkout/draft"
import type { PaymentChoice } from "@/lib/checkout/input"
import { checkoutDraftStore } from "@/lib/checkout/draft-store"
import { cn, focusRing } from "@/lib/utils"

type Phase =
  | { kind: "loading" }
  | { kind: "error" }
  // `source` is what asked: the step opening, or the Check again button
  | { kind: "ready"; result: ReviewOk; source: "arrival" | "again" }

// An Apply or a Remove: the review is asked for again with this code (an empty
// one for Remove), and the answer settles the box (docs/specs/037-vouchers-at-
// checkout, Behavior 4–6)
type VoucherChange = { action: "apply" | "remove"; code: string }

type Props = {
  draft: CheckoutDraft
  // The server refused the details: step 1 shows what to choose again
  onInvalid: (fields: Record<string, string>) => void
  // The cart is gone
  onEmpty: () => void
  // The order exists: the flow clears the saved details, zeroes the header
  // count and goes to the order's link
  // The order link, and the payment page to go to (null: no session opened)
  onPlaced: (
    link: string,
    payUrl: string | null,
    paymentOpening: boolean
  ) => void
}

// Step 2 (docs/specs/029-checkout-steps, Behavior 15–23): sends the saved
// details to the server every time it shows, and shows what comes back. The
// review action only reads (D1). Place order (docs/specs/030-place-an-order,
// Behavior 3–5) sends them again with the digest, key and token this review
// handed out.
export function ReviewStep({ draft, onInvalid, onEmpty, onPlaced }: Props) {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" })
  // Check again keeps the review on screen (and focus on its button) while
  // the new answer is on its way
  const [checking, setChecking] = useState(false)
  // Place order is in flight, or has succeeded and the page is on its way to
  // the order. Either way a second click does nothing.
  const [placing, setPlacing] = useState(false)
  // What the last Place order answered, when the shopper should read it
  const [notice, setNotice] = useState<string | null>(null)
  // Only the latest request may answer
  const latest = useRef(0)

  // The voucher box: what is typed, the request in flight, the message under
  // the field, and where focus goes once the answer is on screen
  const [voucherText, setVoucherText] = useState("")
  const [voucherBusy, setVoucherBusy] = useState<"apply" | "remove" | null>(
    null
  )
  const [voucherMessage, setVoucherMessage] = useState<string | null>(null)
  // The Payment section (docs/specs/038-cash-on-delivery): the choice being
  // sent as a review, and the note under the options
  const [paymentBusy, setPaymentBusy] = useState<PaymentChoice | null>(null)
  const [paymentMessage, setPaymentMessage] = useState<string | null>(null)
  const focusNext = useRef<
    "input" | "remove" | "payment-online" | "payment-cod" | null
  >(null)

  // What the review made of the code it was sent. Only an applied code is
  // kept in the saved details; a refused one stays in the field with its
  // reason, so the shopper can fix or clear it.
  function settleVoucher(
    outcome: ReviewOk["review"]["voucher"],
    sent: string,
    action: VoucherChange["action"] | undefined
  ) {
    const draftStore = checkoutDraftStore.getState()
    if (outcome.kind === "applied") {
      draftStore.update({ voucherCode: outcome.code })
      setVoucherText("")
      setVoucherMessage(null)
      if (action === "apply") focusNext.current = "remove"
    } else if (outcome.kind === "refused") {
      draftStore.update({ voucherCode: "" })
      setVoucherText(sent)
      setVoucherMessage(voucherRefusalText(outcome.refusal))
      if (action === "apply") focusNext.current = "input"
    } else {
      draftStore.update({ voucherCode: "" })
      if (action === "remove") {
        setVoucherText("")
        setVoucherMessage(null)
        focusNext.current = "input"
      }
    }
  }

  // What the review made of the payment choice (docs/specs/038-cash-on-
  // delivery, Behavior 6-7). The chosen option is kept in the saved details; a
  // saved cash choice that isn't offered any more falls back to online with
  // the reason, never silently. `choice` is what the shopper just picked.
  function settlePayment(result: ReviewOk, choice: PaymentChoice | undefined) {
    const { review } = result
    const { requested, chosen, cod, limit } = review.payment
    checkoutDraftStore.getState().update({ payment: chosen })
    if (requested === "cod" && chosen === "online" && !cod.offered) {
      setPaymentMessage(
        codFallbackText(
          codReasonText(cod, {
            pickup: review.method === "pickup",
            regionName: result.address?.region.name ?? null,
            limit,
            total: review.total,
          })
        )
      )
    } else {
      setPaymentMessage(null)
    }
    if (choice) {
      focusNext.current = chosen === "cod" ? "payment-cod" : "payment-online"
    }
  }

  // Sends the details and shows the answer; the caller has already put the
  // step in its loading state. A voucher change or a payment choice keeps the
  // review on screen and answers in its own section.
  async function request(
    source: "arrival" | "again",
    change?: VoucherChange,
    choice?: PaymentChoice
  ) {
    const mine = ++latest.current
    const sent = change ? change.code : draft.voucherCode
    let result: ReviewActionResult | null = null
    try {
      result = await reviewCheckoutAction(
        draftPayload({
          ...draft,
          voucherCode: sent,
          payment: choice ?? draft.payment,
        })
      )
    } catch {
      // A network failure: the same "Try again" as a server error
    }
    if (mine !== latest.current) return
    setChecking(false)
    setVoucherBusy(null)
    setPaymentBusy(null)
    if (!result || (!result.ok && result.reason === "error")) {
      if (change) {
        setVoucherMessage(VOUCHER_COPY.failed)
        focusNext.current = change.action === "apply" ? "input" : "remove"
      } else if (choice) {
        // The review stays as it was; the old choice is still the one in force
        setPaymentMessage(COD_COPY.failed)
        focusNext.current =
          draft.payment === "cod" ? "payment-cod" : "payment-online"
      } else {
        setPhase({ kind: "error" })
      }
    } else if (result.ok) {
      setPhase({ kind: "ready", result, source })
      settleVoucher(result.review.voucher, sent, change?.action)
      settlePayment(result, choice)
    } else if (result.reason === "invalid") {
      onInvalid(result.fields)
    } else {
      onEmpty()
    }
  }

  // Check again and Try again
  function run(source: "arrival" | "again") {
    if (source === "again" && phase.kind === "ready") {
      if (checking) return
      setChecking(true)
    } else {
      setPhase({ kind: "loading" })
    }
    void request(source)
  }

  function changeVoucher(change: VoucherChange) {
    setVoucherMessage(null)
    setVoucherBusy(change.action)
    void request("arrival", change)
  }

  function applyVoucher() {
    if (
      phase.kind !== "ready" ||
      voucherBusy ||
      paymentBusy ||
      checking ||
      placing
    ) {
      return
    }
    const typed = voucherText.trim()
    if (!typed) {
      setVoucherMessage(VOUCHER_COPY.empty)
      document.getElementById(VOUCHER_INPUT_ID)?.focus()
      return
    }
    changeVoucher({ action: "apply", code: typed })
  }

  function removeVoucher() {
    if (
      phase.kind !== "ready" ||
      voucherBusy ||
      paymentBusy ||
      checking ||
      placing
    ) {
      return
    }
    changeVoucher({ action: "remove", code: "" })
  }

  // Choosing an option is a review request, like Apply: a new digest, key and
  // token come back with the answer (docs/specs/038-cash-on-delivery,
  // Behavior 6)
  function choosePayment(choice: PaymentChoice) {
    if (
      phase.kind !== "ready" ||
      voucherBusy ||
      paymentBusy ||
      checking ||
      placing ||
      choice === phase.result.review.payment.chosen
    ) {
      return
    }
    setPaymentMessage(null)
    setPaymentBusy(choice)
    void request("arrival", undefined, choice)
  }

  // Reloads the review under the notice, keeping the old one on screen until
  // the new one arrives
  function reload() {
    setChecking(true)
    void request("arrival")
  }

  // Place order: sends exactly what this review handed out. After a refusal
  // that left the order unplaced the same pair is sent again on a retry; after
  // `changed` the review reloads and brings a new pair.
  async function place() {
    if (phase.kind !== "ready" || placing || checking || paymentBusy) return
    const { digest, idempotencyKey, accessToken } = phase.result
    // The code goes only if this review applied it (spec 037, Behavior 7), and
    // the payment option is the one this review settled on
    const applied = phase.result.review.voucher
    const voucherCode = applied.kind === "applied" ? applied.code : ""
    const payment = phase.result.review.payment.chosen
    setPlacing(true)
    setNotice(null)
    let answer: Awaited<ReturnType<typeof placeOrderAction>> | null = null
    try {
      answer = await placeOrderAction({
        details: draftPayload({ ...draft, voucherCode, payment }),
        digest,
        idempotencyKey,
        accessToken,
      })
    } catch {
      // No answer: it may have gone through. A retry with the same key and
      // token returns the order if it did.
    }
    if (!answer) {
      setNotice(STEP_COPY.placeNetwork)
      setPlacing(false)
    } else if (answer.ok) {
      // Stay busy: the page is leaving for the order
      onPlaced(answer.link, answer.payUrl, answer.paymentOpening === true)
    } else if (answer.reason === "invalid") {
      setPlacing(false)
      onInvalid(answer.fields)
    } else if (answer.reason === "empty") {
      onEmpty()
    } else if (answer.reason === "changed") {
      setNotice(STEP_COPY.placeChanged)
      setPlacing(false)
      reload()
    } else if (answer.reason === "disabled") {
      setPlacing(false)
      reload()
    } else if (answer.reason === "duplicate") {
      setNotice(STEP_COPY.placeDuplicate)
      setPlacing(false)
    } else {
      setNotice(STEP_COPY.placeError)
      setPlacing(false)
    }
  }

  useEffect(() => {
    // Once, when the step opens; the details can't change while it shows
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the answer arrives after an await; the step opens already in its loading state
    void request("arrival")
    const requests = latest
    return () => {
      // Leaving the step drops a request that is still running
      requests.current = -1
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per opening
  }, [])

  // On a blocked review focus goes to the problem summary, so it is the
  // first thing read (Behavior 33)
  useEffect(() => {
    if (phase.kind === "ready" && phase.result.review.problems.length > 0) {
      document.getElementById(PROBLEMS_HEADING_ID)?.focus()
    }
  }, [phase])

  // After a voucher or payment answer is on screen, focus goes to the control
  // it names
  useEffect(() => {
    const target = focusNext.current
    if (!target || voucherBusy || paymentBusy) return
    focusNext.current = null
    const ids = {
      input: VOUCHER_INPUT_ID,
      remove: VOUCHER_REMOVE_ID,
      "payment-online": PAYMENT_ONLINE_ID,
      "payment-cod": PAYMENT_COD_ID,
    }
    document.getElementById(ids[target])?.focus()
  })

  const clean =
    phase.kind === "ready" && phase.result.review.problems.length === 0
  // One polite live region (Behavior 34), not role="status"
  const live = placing
    ? STEP_COPY.placing
    : voucherBusy
      ? VOUCHER_COPY.checking
      : paymentBusy
        ? STEP_COPY.loading
        : phase.kind === "loading" || checking
          ? STEP_COPY.loading
          : phase.kind === "error"
            ? STEP_COPY.loadFailed
            : clean && phase.source === "again"
              ? STEP_COPY.checkedClean
              : ""

  return (
    <div className="flex flex-col gap-4" aria-busy={phase.kind === "loading"}>
      <p aria-live="polite" className="min-h-5 text-sm text-muted-foreground">
        {live}
      </p>
      {notice && (
        <p
          aria-live="polite"
          className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm dark:bg-amber-500/15"
        >
          {notice}
        </p>
      )}
      {phase.kind === "loading" && <ReviewSkeleton />}
      {phase.kind === "error" && (
        <div>
          <Button type="button" onClick={() => run("arrival")}>
            {STEP_COPY.tryAgain}
          </Button>
        </div>
      )}
      {phase.kind === "ready" && (
        <ReviewView
          result={phase.result}
          placing={placing}
          onPlace={() => void place()}
          onCheckAgain={() => run("again")}
          voucher={{
            text: voucherText,
            onText: (text) => {
              setVoucherText(text)
              setVoucherMessage(null)
            },
            busy: voucherBusy,
            message: voucherMessage,
            onApply: applyVoucher,
            onRemove: removeVoucher,
          }}
          payment={{
            busy: paymentBusy,
            message: paymentMessage,
            onChoose: choosePayment,
          }}
        />
      )}
      <div>
        <Link
          href={DETAILS_HREF}
          className={cn(
            buttonVariants({ variant: "link", size: "sm" }),
            focusRing
          )}
        >
          Back to details
        </Link>
      </div>
    </div>
  )
}

// The review's reserved size while it loads
function ReviewSkeleton() {
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_20rem]" aria-hidden="true">
      <div className="flex flex-col gap-4">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
      <Skeleton className="h-56 w-full" />
    </div>
  )
}
