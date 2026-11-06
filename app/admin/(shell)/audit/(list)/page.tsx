import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { connection } from "next/server"

import { AuditFilters } from "@/components/admin/audit-filters"
import { AUDIT_RESULTS_ID, AuditListView } from "@/components/admin/audit-list"
import { NoAccess } from "@/components/admin/no-access"
import { AUDIT_COPY } from "@/lib/admin/audit-copy"
import {
  auditHref,
  isCanonicalAuditQuery,
  parseAuditParams,
} from "@/lib/admin/audit-params"
import { ADMIN_COPY } from "@/lib/admin/copy"
import { listAuditPage } from "@/lib/admin/queries/audit"
import { requireAdminAccess } from "@/lib/admin/session"

export const metadata: Metadata = {
  title: { absolute: ADMIN_COPY.titles.audit },
}

// The audit log (docs/specs/047-admin-audit-log-view). Read-only: filters and
// page live in the URL, a URL that isn't the canonical one redirects, and a
// page past the last redirects to the last. Staff has no audit.view, so the
// page renders NoAccess before any audit read. Data comes only from the query
// layer, which masks it for Demo.
export default async function AdminAuditPage({
  searchParams,
}: PageProps<"/admin/audit">) {
  await connection()
  const { session, allowed } = await requireAdminAccess("audit.view")
  if (!allowed) return <NoAccess />

  const raw = await searchParams
  const parsed = parseAuditParams(raw)
  if (!isCanonicalAuditQuery(raw, parsed)) {
    redirect(auditHref(parsed.params))
  }

  const role = session.user.adminRole
  const result = await listAuditPage(role, parsed.params)
  // An actor that has no audit rows is dropped, like any other bad value
  if (result.unknownActor) redirect(auditHref({ ...parsed.params, actor: "" }))
  if (result.total > 0 && result.page !== parsed.params.page) {
    redirect(auditHref({ ...parsed.params, page: result.page }))
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{AUDIT_COPY.heading}</h1>
        <p className="text-sm text-muted-foreground">{AUDIT_COPY.intro}</p>
      </div>
      <AuditFilters
        params={parsed.params}
        actors={result.actors}
        resultsId={AUDIT_RESULTS_ID}
      />
      <AuditListView
        data={result}
        params={parsed.params}
        demo={role === "demo"}
        rangeCleared={parsed.rangeCleared}
      />
    </div>
  )
}
