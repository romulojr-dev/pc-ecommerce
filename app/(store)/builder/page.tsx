import type { Metadata } from "next"
import Link from "next/link"

import { Container } from "@/components/layout/container"
import { buttonVariants } from "@/components/ui/button"
import { cn, focusRing } from "@/lib/utils"

// A placeholder until the Builder epic (docs/specs/016-home-page). The
// header, footer and home page already link here. Not indexed while empty.
export const metadata: Metadata = {
  title: "PC Builder",
  robots: { index: false },
}

export default function BuilderPage() {
  return (
    <Container className="py-16">
      <div className="flex max-w-xl flex-col items-start gap-4">
        <p className="rounded-full bg-muted px-3 py-1 text-xs font-medium">
          Coming soon
        </p>
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          PC Builder
        </h1>
        <p className="leading-relaxed text-muted-foreground">
          The guided builder is on its way. Pick a part for each step and it
          will check socket, power and fit as you go, so incompatible parts
          never reach checkout. Until then, browse the parts by category.
        </p>
        <Link
          href="/cpu"
          className={cn(
            buttonVariants({ size: "lg" }),
            focusRing,
            "h-10 rounded-lg px-4 text-sm font-semibold"
          )}
        >
          Shop by category
        </Link>
      </div>
    </Container>
  )
}
