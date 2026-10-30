import type { NextConfig } from "next"

// Validate env vars when `next dev` / `next build` start, not on first request
import "./lib/env"

const nextConfig: NextConfig = {
  // The address files are read with fs at request time, which file tracing
  // can't see, so every route that reads them lists them
  // (docs/specs/028-shipping-data-and-fee-rules, D12). Add the checkout routes
  // that call resolveAddress here.
  outputFileTracingIncludes: {
    "/api/psgc/*": ["./data/psgc/json/**/*"],
    "/api/psgc-proof": ["./data/psgc/json/**/*"],
  },
}

export default nextConfig
