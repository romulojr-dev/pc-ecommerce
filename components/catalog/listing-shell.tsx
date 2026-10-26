"use client"

import { useRouter } from "next/navigation"
import { createContext, use, useCallback, useTransition } from "react"

import { cn } from "@/lib/utils"

type Navigate = (href: string, optimistic?: () => void) => void

const NavigateContext = createContext<Navigate | null>(null)

// Goes to another state of the listing (a filter changed), and shows the
// results as loading until it arrives. `optimistic` runs in the same
// transition, so a control can show its new state at once (useOptimistic).
export function useNavigateListing(): Navigate {
  const navigate = use(NavigateContext)
  if (!navigate) {
    throw new Error("useNavigateListing needs a ListingShell around it")
  }
  return navigate
}

type ListingShellProps = {
  // The filter sidebar, rendered on the server
  sidebar: React.ReactNode
  children: React.ReactNode
}

// The listing's two columns: filters on the left, results on the right. It
// owns the navigation transition, so the results are marked busy (and dimmed)
// while a filter's new results load. Both columns stay server-rendered.
export function ListingShell({ sidebar, children }: ListingShellProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const navigate = useCallback<Navigate>(
    (href, optimistic) => {
      startTransition(() => {
        optimistic?.()
        // The sidebar sits next to the results, so keep the scroll position
        router.push(href, { scroll: false })
      })
    },
    [router]
  )

  return (
    <NavigateContext value={navigate}>
      <div className="mt-6 grid gap-8 lg:grid-cols-[15rem_minmax(0,1fr)]">
        {sidebar}
        <div
          aria-busy={isPending}
          className={cn(
            "min-w-0 transition-opacity",
            isPending && "opacity-60"
          )}
        >
          {children}
        </div>
      </div>
    </NavigateContext>
  )
}
