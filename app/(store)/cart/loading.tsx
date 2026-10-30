import { Container } from "@/components/layout/container"
import { Skeleton } from "@/components/ui/skeleton"

// While the cart is read (docs/specs/025-cart-single-items, Behavior 16). The
// cart page has no 404 to protect, unlike /builds/[slug], so it can stream.
export default function Loading() {
  return (
    <Container className="py-8" aria-busy="true">
      <h1 className="font-heading text-3xl font-semibold tracking-tight">
        Cart
      </h1>
      <div className="mt-6 grid items-start gap-8 lg:grid-cols-[1fr_20rem]">
        <div className="divide-y border-y">
          {[0, 1].map((row) => (
            <div key={row} className="flex gap-4 py-5">
              <Skeleton className="size-24 shrink-0" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-4 w-24" />
              </div>
              <Skeleton className="h-8 w-28" />
            </div>
          ))}
        </div>
        <Skeleton className="h-52 w-full" />
      </div>
    </Container>
  )
}
