import type { NextConfig } from "next"

// Validate env vars when `next dev` / `next build` start, not on first request
import "./lib/env"

const nextConfig: NextConfig = {}

export default nextConfig
