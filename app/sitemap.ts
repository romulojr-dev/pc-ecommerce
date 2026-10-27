import type { MetadataRoute } from "next"

import { env } from "@/lib/env"
import { absoluteUrl } from "@/lib/seo/urls"
import { categoryHref, productHref } from "@/lib/site"
import { getSitemapData } from "@/lib/sitemap"

// Generated at build time, then at most hourly; the data is also cached by
// tag (docs/specs/017-seo, ADR 0003). Must match getSitemapData's
// revalidate (a segment config must be a literal).
export const revalidate = 3600

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { homeModified, categories, products } = await getSitemapData()
  const url = (path: string) => absoluteUrl(env.NEXT_PUBLIC_SITE_URL, path)

  return [
    {
      url: url("/"),
      ...(homeModified && { lastModified: homeModified }),
    },
    ...categories.map(({ slug, lastModified }) => ({
      url: url(categoryHref(slug)),
      lastModified,
    })),
    ...products.map(({ categorySlug, slug, lastModified }) => ({
      url: url(productHref(categorySlug, slug)),
      lastModified,
    })),
  ]
}
