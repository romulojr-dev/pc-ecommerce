import type { MetadataRoute } from "next"

import { env } from "@/lib/env"
import { absoluteUrl } from "@/lib/seo/urls"

// Nothing is disallowed, on purpose (docs/specs/017-seo). Search and
// filtered pages are kept out of the index by their noindex tag, which a
// crawler only sees if it may fetch the page; a blocked URL can still be
// indexed from links, and blocking would stop crawlers following the
// product links on those pages. Previews get X-Robots-Tag: noindex from
// Vercel.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: absoluteUrl(env.NEXT_PUBLIC_SITE_URL, "/sitemap.xml"),
  }
}
