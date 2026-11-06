"use client"

import { Button } from "@/components/ui/button"
import { AUDIT_COPY } from "@/lib/admin/audit-copy"

// What the audit log shows when loading it fails (docs/specs/047-admin-audit-
// log-view, B6): one line and a retry, never the failure's detail.
export default function AdminAuditError({ reset }: { reset: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3">
      <h1 className="text-2xl font-semibold">{AUDIT_COPY.heading}</h1>
      <p role="alert">{AUDIT_COPY.listError}</p>
      <Button onClick={reset}>{AUDIT_COPY.retry}</Button>
    </div>
  )
}
