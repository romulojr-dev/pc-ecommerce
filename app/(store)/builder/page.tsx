import type { Metadata } from "next"

import { Builder } from "@/components/builder/builder"
import { Container } from "@/components/layout/container"
import { socialMetadata } from "@/lib/seo/metadata"
import { siteConfig } from "@/lib/site"

const title = "PC Builder"
const description = `Pick a part for each slot and ${siteConfig.name} checks socket, memory, fit and power as you go.`

// A shopper's own build, so not indexed, and kept out of the sitemap
// (docs/specs/020-builder-page, Behavior 17)
export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/builder" },
  robots: { index: false },
  ...socialMetadata({ title, description, path: "/builder" }),
}

// Static: the build lives in the browser, which loads its parts from
// /api/builder/parts (docs/specs/020-builder-page, D2)
export default function BuilderPage() {
  return (
    <Container className="py-8">
      <div className="mb-6 flex max-w-2xl flex-col gap-2">
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          PC Builder
        </h1>
        <p className="leading-relaxed text-muted-foreground">
          Pick a part for each slot. We check that everything fits and has
          enough power as you go.
        </p>
      </div>
      <Builder />
    </Container>
  )
}
