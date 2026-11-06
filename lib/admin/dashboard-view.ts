import { formatPeso } from "@/lib/format"

import { DASHBOARD_COPY } from "./dashboard-copy"
import { type AdminRole, can } from "./permissions"
import type { SalesFigures } from "./dashboard-sales"

// The figures as text (docs/specs/048-admin-dashboard, B5, B10). Pure.
export type FigureTexts = {
  paidSales: string
  placed: string
  average: string
}

export function figureTexts(figures: SalesFigures): FigureTexts {
  return {
    paidSales: formatPeso(figures.paidSales),
    placed: String(figures.placed),
    average:
      figures.averageOrder === null
        ? DASHBOARD_COPY.noValue
        : formatPeso(figures.averageOrder),
  }
}

// Where a role lands after signing in (B2, R13): the dashboard for whoever may
// open it, Orders for the rest
export function adminHomeFor(role: AdminRole): string {
  return can(role, "dashboard.view") ? "/admin/dashboard" : "/admin/orders"
}
