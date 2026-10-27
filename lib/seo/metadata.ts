import type { Metadata } from "next"

import { siteConfig } from "@/lib/site"

// Link previews: Open Graph and Twitter tags (docs/specs/017-seo). Pages
// always pass through here, because metadata merges shallowly: a page's
// openGraph replaces the layout's whole block, image included.

// public/images/og-default.png, made by `pnpm images:og`
export const DEFAULT_OG_IMAGE = {
  url: "/images/og-default.png",
  width: 1200,
  height: 630,
  alt: "PC Silicon: PC parts and a PC Builder that checks compatibility",
}

// Link-preview crawlers (Facebook, X, Messenger, Slack) don't render SVG,
// which is what the placeholder product images are
const RASTER = /\.(png|jpe?g|webp|gif)$/i

export function isRasterImage(url: string): boolean {
  return RASTER.test(url.split(/[?#]/)[0])
}

// `path` is the page's canonical href, left out for pages without one.
// Relative URLs are made absolute by the root layout's metadataBase.
// Twitter's title, description and image are filled in by Next from
// openGraph.
export function socialMetadata({
  title,
  description,
  path,
  image,
}: {
  title: string
  description: string
  path?: string
  image?: { url: string; alt: string }
}): Pick<Metadata, "openGraph" | "twitter"> {
  // A product photo is roughly square, so it gets the small card
  const photo = image && isRasterImage(image.url) ? image : undefined
  return {
    openGraph: {
      type: "website",
      siteName: siteConfig.name,
      locale: "en_PH",
      ...(path && { url: path }),
      title,
      description,
      images: [photo ?? DEFAULT_OG_IMAGE],
    },
    twitter: { card: photo ? "summary" : "summary_large_image" },
  }
}
