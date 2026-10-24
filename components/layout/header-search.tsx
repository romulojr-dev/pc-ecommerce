import { SearchIcon } from "lucide-react"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

// Visual only (spec 002): no <form>, so Enter does nothing
function HeaderSearch() {
  return (
    <div role="search" className="relative w-full max-w-65">
      <Label htmlFor="site-search" className="sr-only">
        Search parts
      </Label>
      <SearchIcon
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        id="site-search"
        type="search"
        placeholder="Search parts…"
        autoComplete="off"
        className="h-9 rounded-xl border-transparent bg-muted pl-9 md:text-sm dark:bg-muted"
      />
    </div>
  )
}

export { HeaderSearch }
