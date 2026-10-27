import { SiteFooter } from "@/components/layout/site-footer"
import { SiteHeader } from "@/components/layout/site-header"
import { SkipLink } from "@/components/layout/skip-link"

// `search` is the header's search box: a parallel-route slot, so /search can
// render it on the server with the query (@search/search/page.tsx); every
// other page gets the empty box (@search/default.tsx)
export default function StoreLayout({
  children,
  search,
}: Readonly<{
  children: React.ReactNode
  search: React.ReactNode
}>) {
  return (
    <>
      <SkipLink />
      <SiteHeader search={search} />
      <main id="main-content" tabIndex={-1} className="flex-1 outline-none">
        {children}
      </main>
      <SiteFooter />
    </>
  )
}
