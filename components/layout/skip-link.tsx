import { buttonVariants } from "@/components/ui/button"
import { cn, focusRing } from "@/lib/utils"

function SkipLink() {
  return (
    <a
      href="#main-content"
      className={cn(
        buttonVariants({ size: "lg" }),
        focusRing,
        "sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50"
      )}
    >
      Skip to content
    </a>
  )
}

export { SkipLink }
