// Absolute URLs for what metadataBase doesn't cover: the sitemap, robots.txt
// and JSON-LD (docs/specs/017-seo). Composed like metadataBase does, so they
// match the canonicals: no doubled slash, and the home URL has no trailing
// slash. Takes the site URL as an argument, so it stays pure (no env).
export function absoluteUrl(siteUrl: string, path: string): string {
  // Already absolute, e.g. a ProductImage.url on a CDN
  if (/^https?:\/\//.test(path)) return path
  const base = siteUrl.replace(/\/+$/, "")
  if (path === "/" || path === "") return base
  return `${base}/${path.replace(/^\/+/, "")}`
}
