import Link from "next/link"

import { buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AUDIT_ENTITIES } from "@/lib/admin/audit-data"
import { AUDIT_COPY } from "@/lib/admin/audit-copy"
import { ENTITY_LABELS } from "@/lib/admin/audit-labels"
import {
  AUDIT_PATH,
  type AuditParams,
  hasActiveAuditFilters,
} from "@/lib/admin/audit-params"
import type { AuditActor } from "@/lib/admin/queries/audit"
import { cn, focusRing } from "@/lib/utils"

// The filter form of the audit log (docs/specs/047-admin-audit-log-view, B5):
// a plain GET form, so a filter is a URL and works without JavaScript.
// Submitting leaves out the page, so a new filter starts at page 1.

const selectClass =
  "h-7 w-full min-w-0 rounded-md border border-input bg-input/20 px-2 text-xs/relaxed outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 dark:bg-input/30"

export function AuditFilters({
  params,
  actors,
  resultsId,
}: {
  params: AuditParams
  actors: AuditActor[]
  resultsId: string
}) {
  const copy = AUDIT_COPY.filters
  return (
    <form
      method="get"
      action={`${AUDIT_PATH}#${resultsId}`}
      className="flex flex-wrap items-end gap-3"
    >
      <div className="flex flex-col gap-1">
        <Label htmlFor="audit-entity">{copy.entity}</Label>
        <select
          id="audit-entity"
          name="entity"
          defaultValue={params.entity ?? ""}
          className={selectClass}
        >
          <option value="">{copy.allEntities}</option>
          {AUDIT_ENTITIES.map((entity) => (
            <option key={entity} value={entity}>
              {ENTITY_LABELS[entity]}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="audit-actor">{copy.actor}</Label>
        <select
          id="audit-actor"
          name="actor"
          defaultValue={params.actor}
          className={selectClass}
        >
          <option value="">{copy.allPeople}</option>
          {actors.map((actor) => (
            <option key={actor.id} value={actor.id}>
              {actor.name} ({actor.role})
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="audit-from">{copy.from}</Label>
        <Input
          id="audit-from"
          name="from"
          type="date"
          defaultValue={params.from}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="audit-to">{copy.to}</Label>
        <Input id="audit-to" name="to" type="date" defaultValue={params.to} />
      </div>
      <button
        type="submit"
        className={cn(buttonVariants({ size: "default" }), focusRing)}
      >
        {copy.submit}
      </button>
      {hasActiveAuditFilters(params) ? (
        <Link
          href={AUDIT_PATH}
          className={cn(buttonVariants({ variant: "ghost" }), focusRing)}
        >
          {copy.clear}
        </Link>
      ) : null}
    </form>
  )
}
