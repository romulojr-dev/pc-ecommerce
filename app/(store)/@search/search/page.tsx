import { HeaderSearch } from "@/components/layout/header-search"
import { cleanQuery } from "@/lib/listing-params"

// The header's search box on /search, holding the query that was searched.
// Rendered on the server, so it is filled in without JavaScript too
// (docs/specs/014-search).
export default async function SearchSlot({
  searchParams,
}: PageProps<"/search">) {
  return <HeaderSearch serverQuery={cleanQuery(await searchParams)} />
}
