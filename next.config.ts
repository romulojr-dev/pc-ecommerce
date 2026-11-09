import type { NextConfig } from "next"

// Validate env vars when `next dev` / `next build` start, not on first request
import { env } from "./lib/env"
import { imageRemotePatterns } from "./lib/images/env-schema"

const nextConfig: NextConfig = {
  // Uploaded product photos (docs/specs/049-product-images-upload, R11, R17,
  // ADR 0013). remotePatterns lists only our own Blob store(s), never a
  // wildcard host; the fake store serves from this site and needs none. Every
  // upload is already WebP, named at random and never overwritten, so the
  // optimizer serves WebP only (one transformation per image and width,
  // against Hobby's 5,000 a month) and caches for 31 days.
  images: {
    remotePatterns: imageRemotePatterns(env),
    formats: ["image/webp"],
    minimumCacheTTL: 60 * 60 * 24 * 31,
  },
  // The address files are read with fs at request time. Turbopack happens to
  // trace the plain path.join(process.cwd(), …) call, but that is an accident
  // of the analysis, so every route that reads the files lists them
  // explicitly (docs/specs/028-shipping-data-and-fee-rules, D12; ADR 0008).
  // Every route that calls resolveAddress must be listed here too (#77, #78).
  outputFileTracingIncludes: {
    "/api/psgc/*": ["./data/psgc/json/**/*"],
    // The review's server action runs resolveAddress in this page's function
    // (docs/specs/029-checkout-steps)
    "/checkout": ["./data/psgc/json/**/*"],
  },
  // An order's link carries its secret key (docs/specs/030-place-an-order,
  // Behavior 16): never cached, and never sent on as a referrer
  async headers() {
    return [
      {
        source: "/orders/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
      // The fake gateway's payment page carries the same key
      // (docs/specs/031-pay-with-xendit, Behavior 15)
      {
        source: "/test-payment/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
      // Staff sign-in and the admin shell: nothing is cached and no URL is
      // sent on as a referrer (docs/specs/039-staff-sign-in-admin-shell,
      // Rule 16)
      {
        source: "/admin/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
      {
        source: "/api/auth/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
      // The recorded test emails carry signed order links
      // (docs/specs/036-order-emails, Behavior 15)
      {
        source: "/dev/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
    ]
  },
}

export default nextConfig
