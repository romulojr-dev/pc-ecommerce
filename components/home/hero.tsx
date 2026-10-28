import { TagIcon, WrenchIcon } from "lucide-react"
import Link from "next/link"

import { WaferIllustration } from "@/components/home/wafer-illustration"
import { buttonVariants } from "@/components/ui/button"
import { cn, focusRing } from "@/lib/utils"

const ctaClass = "h-10 rounded-lg px-4 text-sm font-semibold"

// The home page's opening (docs/specs/016-home-page): the page's h1 and its
// two calls to action. "Shop deals" jumps to the Deals section, so it is
// left out when there are no deals.
export function Hero({ hasDeals }: { hasDeals: boolean }) {
  return (
    <section
      aria-labelledby="hero-heading"
      className="grid items-center gap-12 py-12 lg:grid-cols-2"
    >
      <div className="flex flex-col items-start gap-6">
        <h1
          id="hero-heading"
          className="max-w-md font-heading text-5xl leading-[1.05] font-semibold tracking-tight"
        >
          Build a PC that just works.
        </h1>
        <p className="max-w-md text-base leading-relaxed text-muted-foreground">
          Pick your parts and the PC Builder checks socket, power and fit as you
          go. Or skip straight to this week&rsquo;s best component deals.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/builder"
            className={cn(buttonVariants({ size: "lg" }), focusRing, ctaClass)}
          >
            <WrenchIcon aria-hidden="true" data-icon="inline-start" />
            Build your PC
          </Link>
          {hasDeals && (
            <Link
              href="#deals"
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                focusRing,
                ctaClass
              )}
            >
              <TagIcon aria-hidden="true" data-icon="inline-start" />
              Shop deals
            </Link>
          )}
        </div>
      </div>
      <div className="flex aspect-[6/5] items-center justify-center rounded-xl bg-muted p-8">
        <WaferIllustration className="max-w-md" />
      </div>
    </section>
  )
}
