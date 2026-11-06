import { DASHBOARD_COPY } from "@/lib/admin/dashboard-copy"

// The count of orders that need payment review (docs/specs/048-admin-
// dashboard, B8). No link yet: #111 adds the review list and the link to it.

const copy = DASHBOARD_COPY.review
const HEADING_ID = "dashboard-review"

export function DashboardReview({ count }: { count: number }) {
  return (
    <section aria-labelledby={HEADING_ID} className="flex flex-col gap-2">
      <h2 id={HEADING_ID} className="text-lg font-semibold">
        {copy.heading}
      </h2>
      <p className="rounded-md border p-4">
        {count === 0 ? copy.empty : copy.text(count)}
      </p>
    </section>
  )
}
