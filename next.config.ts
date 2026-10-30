import type { NextConfig } from "next"

// Validate env vars when `next dev` / `next build` start, not on first request
import "./lib/env"

const nextConfig: NextConfig = {
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
}

export default nextConfig
