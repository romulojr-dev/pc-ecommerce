import "server-only"

import { EMAIL_COPY } from "./copy"

// The fulfillment emails' strings (docs/specs/043-order-fulfillment-
// transitions, §5). The prefix, test-mode sentence, footer and link note are
// the order emails' own (EMAIL_COPY).

export const shippedSubject = (orderNumber: string): string =>
  `${EMAIL_COPY.subjectPrefix}Order ${orderNumber} has shipped`

export const readySubject = (orderNumber: string): string =>
  `${EMAIL_COPY.subjectPrefix}Order ${orderNumber} is ready for pickup`

export const deliveredSubject = (orderNumber: string): string =>
  `${EMAIL_COPY.subjectPrefix}Order ${orderNumber} was delivered`

export const shippedLead = (orderNumber: string): string =>
  `Your order ${orderNumber} is on its way.`

export const readyLead = (orderNumber: string): string =>
  `Your order ${orderNumber} is ready for pickup.`

export const deliveredLead = (orderNumber: string): string =>
  `Your order ${orderNumber} was delivered.`

export const courierLine = (courier: string): string => `Courier: ${courier}`

export const trackingLine = (trackingNumber: string): string =>
  `Tracking number: ${trackingNumber}`

export const shippedAtLine = (time: string): string => `Shipped ${time}`

export const readyAtLine = (time: string): string => `Ready ${time}`

export const deliveredAtLine = (time: string): string => `Delivered ${time}`

// A cash order says what to have ready; the amount is the order's total
export const cashReadyLine = (total: string, pickup: boolean): string =>
  pickup
    ? `Please bring ${total} to pay when you pick it up.`
    : `Please have ${total} ready when it arrives.`
