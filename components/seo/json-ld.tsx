import { serializeJsonLd } from "@/lib/seo/json-ld"

// Structured data for search engines (docs/specs/017-seo). Takes an object,
// never a string, so every script goes through serializeJsonLd's escaping.
// A plain <script>, not next/script: this is data, not code to run.
export function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  )
}
