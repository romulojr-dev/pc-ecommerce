import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { connection } from "next/server"

import { SharedBuild } from "@/components/builds/shared-build"
import { Container } from "@/components/layout/container"
import { isShareSlug } from "@/lib/build-share-slug"
import { sharedBuildView } from "@/lib/build-state/shared"
import { socialMetadata } from "@/lib/seo/metadata"
import { getSharedBuild } from "@/lib/shared-build"
import { siteConfig } from "@/lib/site"

const title = "Shared PC build"
const description = `A PC build shared from ${siteConfig.name}. See the parts, the total price and whether everything fits, then open it in the PC Builder.`

// A shopper's own build, so not indexed and kept out of the sitemap, with its
// own canonical and link preview (docs/specs/022-share-build, Behavior 18).
// An unknown slug is a 404 here too, so the page and its metadata agree.
export async function generateMetadata({
  params,
}: PageProps<"/builds/[slug]">): Promise<Metadata> {
  const { slug } = await params
  // React cache: the page's own read reuses this one
  if (!isShareSlug(slug) || !(await getSharedBuild(slug))) notFound()

  const path = `/builds/${slug}`
  return {
    title,
    description,
    alternates: { canonical: path },
    robots: { index: false },
    ...socialMetadata({ title, description, path }),
  }
}

// A shared build, read-only (docs/specs/022-share-build). Prices, stock and
// specs are read on every request, so they are always current (ADR 0003). No
// route-level loading state: a skeleton would stream a 200 before notFound()
// could answer 404 (D14).
export default async function SharedBuildPage({
  params,
}: PageProps<"/builds/[slug]">) {
  await connection()

  const { slug } = await params
  // A slug of the wrong shape is a 404 without a query
  if (!isShareSlug(slug)) notFound()
  const snapshot = await getSharedBuild(slug)
  if (!snapshot) notFound()

  const view = sharedBuildView(snapshot.items)

  return (
    <Container className="py-8">
      <div className="mb-6 flex max-w-2xl flex-col gap-2">
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          Shared PC build
        </h1>
        <p className="leading-relaxed text-muted-foreground">
          Someone shared this build with you. Prices and stock are current; the
          parts are the ones chosen when it was shared.
        </p>
      </div>
      <SharedBuild view={view} />
    </Container>
  )
}
