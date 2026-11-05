"use client"

import { Button } from "@/components/ui/button"
import { ADMIN_COPY } from "@/lib/admin/copy"

// What the list shows when loading it fails (docs/specs/042-admin-customers,
// B10): one line and a retry, never the failure's detail.
export default function AdminCustomersError({ reset }: { reset: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3">
      <h1 className="text-2xl font-semibold">{ADMIN_COPY.customers.heading}</h1>
      <p role="alert">{ADMIN_COPY.customers.error}</p>
      <Button onClick={reset}>{ADMIN_COPY.customers.retry}</Button>
    </div>
  )
}
