"use client"

import { Button } from "@/components/ui/button"
import { PRODUCT_COPY } from "@/lib/admin/products-copy"

// What the list shows when loading it fails (docs/specs/045-admin-products-
// create-edit, B7): one line and a retry, never the failure's detail.
export default function AdminProductsError({ reset }: { reset: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3">
      <h1 className="text-2xl font-semibold">{PRODUCT_COPY.heading}</h1>
      <p role="alert">{PRODUCT_COPY.listError}</p>
      <Button onClick={reset}>{PRODUCT_COPY.retry}</Button>
    </div>
  )
}
