import Link from "next/link"

import { buttonVariants } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { AUDIT_COPY } from "@/lib/admin/audit-copy"
import { actionLabel, entityLabel } from "@/lib/admin/audit-labels"
import {
  AUDIT_PATH,
  type AuditParams,
  auditHref,
  hasActiveAuditFilters,
} from "@/lib/admin/audit-params"
import type { AuditEntryView, AuditPage } from "@/lib/admin/queries/audit"
import { dateTimeText } from "@/lib/orders/time"
import { cn, focusRing } from "@/lib/utils"

// The audit log (docs/specs/047-admin-audit-log-view, B4, B6, B8 to B10): one
// row per recorded change, newest first, each with a native <details> that
// opens the readable diff. Takes the query's answer, so it is testable as
// markup with no session. Raw JSON is never drawn.

export const AUDIT_RESULTS_ID = "audit-results"

function Changes({ entry }: { entry: AuditEntryView }) {
  const copy = AUDIT_COPY
  return (
    <details>
      <summary className={cn("cursor-pointer text-sm underline", focusRing)}>
        {copy.showChanges}
      </summary>
      {entry.changes.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">{copy.noFields}</p>
      ) : (
        <table className="mt-2 w-full text-sm">
          <thead>
            <tr className="text-left">
              <th scope="col" className="pr-4 font-medium">
                {copy.diffHeaders.field}
              </th>
              <th scope="col" className="pr-4 font-medium">
                {copy.diffHeaders.before}
              </th>
              <th scope="col" className="font-medium">
                {copy.diffHeaders.after}
              </th>
            </tr>
          </thead>
          <tbody>
            {entry.changes.map((change) => (
              <tr key={change.path} className="align-top">
                <th scope="row" className="pr-4 text-left font-normal">
                  {change.label}
                </th>
                <td className="pr-4 break-words" title={change.before}>
                  {change.before}
                </td>
                <td className="break-words" title={change.after}>
                  {change.after}
                  {change.looksUnchanged ? (
                    <span className="ml-2 rounded border px-1 py-0.5 text-xs">
                      {copy.changedBadge}
                    </span>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </details>
  )
}

export function AuditListView({
  data,
  params,
  demo,
  rangeCleared,
}: {
  data: AuditPage
  params: AuditParams
  demo: boolean
  rangeCleared: boolean
}) {
  const copy = AUDIT_COPY
  const filtered = hasActiveAuditFilters(params)
  return (
    <section aria-labelledby={AUDIT_RESULTS_ID} className="flex flex-col gap-3">
      {rangeCleared ? <p role="note">{copy.rangeCleared}</p> : null}
      {demo ? (
        <p className="text-sm text-muted-foreground">{copy.demoNote}</p>
      ) : null}
      <div className="flex flex-wrap items-baseline gap-3">
        <h2
          id={AUDIT_RESULTS_ID}
          tabIndex={-1}
          className="text-lg font-semibold outline-none"
        >
          {copy.count(data.total)}
        </h2>
        <p className="text-sm text-muted-foreground">
          {copy.pageOf(data.page, data.pageCount)}
        </p>
      </div>

      {data.entries.length === 0 ? (
        <div className="flex flex-col items-start gap-2 rounded-md border p-6">
          <p>{filtered ? copy.emptyFiltered : copy.empty}</p>
          {filtered ? (
            <Link
              href={AUDIT_PATH}
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                focusRing
              )}
            >
              {copy.filters.clear}
            </Link>
          ) : null}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableCaption className="sr-only">{copy.caption}</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">{copy.columns.when}</TableHead>
                <TableHead scope="col">{copy.columns.who}</TableHead>
                <TableHead scope="col">{copy.columns.what}</TableHead>
                <TableHead scope="col">{copy.columns.which}</TableHead>
                <TableHead scope="col">{copy.columns.changes}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.entries.map((entry) => (
                <TableRow key={entry.id} className="align-top">
                  <TableCell className="whitespace-nowrap">
                    {dateTimeText(entry.createdAt)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {entry.actor.name} ({entry.actor.role})
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {entityLabel(entry.entity)} · {actionLabel(entry.action)}
                  </TableCell>
                  <TableCell>
                    {entry.target.href ? (
                      <Link
                        href={entry.target.href}
                        className={cn(
                          "underline underline-offset-4",
                          focusRing
                        )}
                      >
                        {entry.target.label}
                      </Link>
                    ) : (
                      entry.target.label
                    )}
                  </TableCell>
                  <TableCell className="min-w-64">
                    <Changes entry={entry} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {data.pageCount > 1 ? (
        <nav
          aria-label={copy.paginationLabel}
          className="flex items-center justify-between gap-3"
        >
          {data.page > 1 ? (
            <Link
              href={auditHref({ ...params, page: data.page - 1 })}
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                focusRing
              )}
            >
              {copy.previous}
            </Link>
          ) : (
            <span />
          )}
          {data.page < data.pageCount ? (
            <Link
              href={auditHref({ ...params, page: data.page + 1 })}
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                focusRing
              )}
            >
              {copy.next}
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </section>
  )
}
