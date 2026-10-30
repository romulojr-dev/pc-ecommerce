import { z } from "zod"

import { zipSchema } from "@/lib/psgc/zip"

import { normalizeMobile } from "./mobile"

// What step 1 collects and what the server checks again on every review
// (docs/specs/029-checkout-steps, §4 Inputs). One schema for the browser and
// the server. Pure: no database, no `next`. Names, prices, fees and cart ids
// are never part of it, and unknown fields are dropped.

export const CHECKOUT_COPY = {
  emailMissing: "Enter your email.",
  emailInvalid: "Enter an email address like name@example.com.",
  nameMissing: "Enter your full name.",
  nameLong: "Use 100 characters or fewer.",
  mobileMissing: "Enter your mobile number.",
  mobileInvalid: "Enter a mobile number like 0917 123 4567.",
  region: "Choose your region.",
  province: "Choose your province.",
  city: "Choose your city or municipality.",
  barangay: "Choose your barangay.",
  streetMissing: "Enter your street address.",
  streetLong: "Use 200 characters or fewer.",
  // The server's answer when the chain of places doesn't hold
  regionAgain: "Choose your region again.",
  provinceAgain: "Choose your province again.",
  cityAgain: "Choose your city or municipality again.",
  barangayAgain: "Choose your barangay again.",
} as const

const code = (message: string) =>
  z.string({ error: message }).regex(/^\d{10}$/, message)

const contactSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, CHECKOUT_COPY.emailMissing)
    .max(254, CHECKOUT_COPY.emailInvalid)
    .pipe(z.email(CHECKOUT_COPY.emailInvalid)),
  name: z
    .string()
    .transform((value) => value.trim().replace(/\s+/g, " "))
    .pipe(
      z
        .string()
        .min(1, CHECKOUT_COPY.nameMissing)
        .max(100, CHECKOUT_COPY.nameLong)
    ),
  mobile: z
    .string()
    .trim()
    .min(1, CHECKOUT_COPY.mobileMissing)
    .transform((value, ctx) => {
      const mobile = normalizeMobile(value)
      if (!mobile) {
        ctx.issues.push({
          code: "custom",
          message: CHECKOUT_COPY.mobileInvalid,
          input: value,
        })
        return z.NEVER
      }
      return mobile
    }),
})

const addressSchema = z.object({
  regionCode: code(CHECKOUT_COPY.region),
  provinceCode: code(CHECKOUT_COPY.province),
  cityCode: code(CHECKOUT_COPY.city),
  barangayCode: code(CHECKOUT_COPY.barangay),
  street: z
    .string()
    .trim()
    .min(1, CHECKOUT_COPY.streetMissing)
    .max(200, CHECKOUT_COPY.streetLong),
  zip: z.string().trim().pipe(zipSchema),
})

// Pickup carries no address: a sent one is dropped, never echoed back (I14)
export const checkoutInputSchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal("delivery"),
    contact: contactSchema,
    address: addressSchema,
  }),
  z.object({ method: z.literal("pickup"), contact: contactSchema }),
])

export type CheckoutInput = z.output<typeof checkoutInputSchema>
export type CheckoutAddressInput = z.output<typeof addressSchema>

// The first message per field, keyed by its path ("contact.mobile",
// "address.zip"), for the form and for the server's "invalid" answer. A
// problem with the payload itself has the key "" and no message to show.
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = issue.path.join(".")
    if (!(key in errors)) errors[key] = issue.message
  }
  return errors
}
