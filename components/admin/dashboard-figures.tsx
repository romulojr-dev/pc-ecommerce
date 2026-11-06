import { DASHBOARD_COPY } from "@/lib/admin/dashboard-copy"
import type { SalesFigures } from "@/lib/admin/dashboard-sales"
import { figureTexts } from "@/lib/admin/dashboard-view"

// Paid sales, orders placed and the average for one window
// (docs/specs/048-admin-dashboard, B5, B10). Takes the figures, so it is
// testable as markup with no session.

const copy = DASHBOARD_COPY

export function DashboardFigures({
  id,
  heading,
  figures,
}: {
  id: string
  heading: string
  figures: SalesFigures
}) {
  const text = figureTexts(figures)
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="text-lg font-semibold">
        {heading}
      </h2>
      <dl className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-md border p-4">
          <dt className="text-sm text-muted-foreground">
            {copy.labels.paidSales}
          </dt>
          <dd className="text-2xl font-semibold">{text.paidSales}</dd>
          <dd className="mt-1 text-xs text-muted-foreground">
            {copy.paidSalesNote}
          </dd>
        </div>
        <div className="rounded-md border p-4">
          <dt className="text-sm text-muted-foreground">
            {copy.labels.placed}
          </dt>
          <dd className="text-2xl font-semibold">{text.placed}</dd>
          <dd className="mt-1 text-xs text-muted-foreground">
            {copy.placedNote}
          </dd>
        </div>
        <div className="rounded-md border p-4">
          <dt className="text-sm text-muted-foreground">
            {copy.labels.average}
          </dt>
          <dd className="text-2xl font-semibold">{text.average}</dd>
        </div>
      </dl>
    </section>
  )
}
