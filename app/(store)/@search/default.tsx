import { HeaderSearch } from "@/components/layout/header-search"

// The header's search box on every page but /search: empty
// (docs/specs/014-search; see components/layout/header-search.tsx)
export default function SearchSlotDefault() {
  return <HeaderSearch serverQuery="" />
}
