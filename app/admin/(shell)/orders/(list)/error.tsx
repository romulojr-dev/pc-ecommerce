"use client"

import { Button } from "@/components/ui/button"
import { ADMIN_COPY } from "@/lib/admin/copy"

// What the list shows when loading it fails (docs/specs/041-admin-orders-
// list-detail, B9): one line and a retry, never the failure's detail.
export default function AdminOrdersError({ reset }: { reset: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3">
      <h1 className="text-2xl font-semibold">{ADMIN_COPY.orders.heading}</h1>
      <p role="alert">{ADMIN_COPY.orders.error}</p>
      <Button onClick={reset}>{ADMIN_COPY.orders.retry}</Button>
    </div>
  )
}
