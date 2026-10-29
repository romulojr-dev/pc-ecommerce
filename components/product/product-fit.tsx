"use client"

import { createContext, type ReactNode, useContext, useMemo } from "react"

import { useFitsStatus } from "@/hooks/use-fits"
import type { LoadStatus } from "@/lib/build-state/add-decision"
import type { Fit, FitPart } from "@/lib/build-state/fit"

// How the product on this page sits in the saved build (docs/specs/024-add-
// anyway-product-page): one load of the build's parts, shared by the "Fit
// with your build" block and Add to build, so the page still makes one
// request. `fit` is null until the saved build has loaded, and when it fails.
export type ProductFitState = { status: LoadStatus; fit: Fit | null }

// No verdict and nothing to wait for: a product with no part to check (outside
// the builder categories, or specs that don't validate). Add to build then adds
// as it always did.
const NO_VERDICT: ProductFitState = { status: "ready", fit: null }

const ProductFitContext = createContext<ProductFitState>(NO_VERDICT)

export const useProductFit = () => useContext(ProductFitContext)

export function ProductFit({
  part,
  children,
}: {
  part: FitPart | null
  children: ReactNode
}) {
  // The hook can't be called conditionally, so it lives one level down
  return part ? <Loaded part={part}>{children}</Loaded> : <>{children}</>
}

function Loaded({ part, children }: { part: FitPart; children: ReactNode }) {
  const parts = useMemo(() => [part], [part])
  const { status, fits } = useFitsStatus(parts)
  const value = useMemo(
    () => ({ status, fit: fits?.[0] ?? null }),
    [status, fits]
  )
  return <ProductFitContext value={value}>{children}</ProductFitContext>
}
