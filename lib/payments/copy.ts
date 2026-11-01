// Shopper copy for paying (docs/specs/031-pay-with-xendit, §5)

export const PAY_COPY = {
  payNow: "Pay now",
  retry: "Retry payment",
  opening: "Opening the payment page…",
  openFailed: "We couldn't open the payment page. Try again.",
  confirming: "Confirming your payment…",
  cancelled: "Payment not completed. You haven't been charged.",
  tooLate:
    "This order expires in a few minutes and can't be paid. Place a new order.",
  // The fake payment page
  fakeTitle: "Test payment",
  fakeHeading: "Test payment, not Xendit",
  fakeNote:
    "This page stands in for Xendit in tests and previews. Nothing is charged.",
  fakePay: "Pay",
  fakeCancel: "Cancel",
  fakeExpire: "Let it expire",
  fakeClosed: "This test payment is closed.",
  backToOrder: "Back to your order",
} as const

// Who the page is waiting for, named after the gateway in use
export const stillConfirmingText = (gatewayName: string): string =>
  `Still confirming. This page updates when we hear from ${gatewayName}.`

export const XENDIT_INSTRUCTIONS =
  "Pay with a test card: 4000 0000 0000 1000, any future expiry date, any CVV (4000 0000 0000 2503 shows a 3-D Secure step). For GCash or Maya, choose the wallet and continue: the test payment completes at once, with no wallet login."

export const FAKE_INSTRUCTIONS =
  "Payments here use a test page, not Xendit: choose Pay or Cancel."

// The session's description on Xendit's page
export const sessionDescription = (orderNumber: string): string =>
  `PC Silicon order ${orderNumber}`
