"use client"

import { Button } from "@/components/ui/button"
import { INVENTORY_COPY } from "@/lib/admin/inventory-copy"

// What the list shows when loading it fails (docs/specs/046-admin-inventory-
// adjustments, B7): one line and a retry, never the failure's detail.
export default function AdminInventoryError({ reset }: { reset: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3">
      <h1 className="text-2xl font-semibold">{INVENTORY_COPY.heading}</h1>
      <p role="alert">{INVENTORY_COPY.listError}</p>
      <Button onClick={reset}>{INVENTORY_COPY.retry}</Button>
    </div>
  )
}
