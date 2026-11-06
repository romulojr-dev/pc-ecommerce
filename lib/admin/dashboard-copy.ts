// Every string the dashboard shows (docs/specs/048-admin-dashboard, §5). Pure.
export const DASHBOARD_COPY = {
  heading: "Dashboard",
  intro: "How the shop is doing, in Philippine time.",
  demoNote: "Customer details are hidden in the demo.",
  windows: { today: "Today", last30: "Last 30 days" },
  labels: {
    paidSales: "Paid sales",
    placed: "Orders placed",
    average: "Average order value",
  },
  paidSalesNote:
    "Excludes cancelled and refunded orders. Cash orders count when delivered or picked up.",
  placedNote: "Every order placed, whatever its status.",
  refundNote:
    "A refund recorded later lowers the figure for the day the order was paid.",
  noValue: "—",
  restock: {
    heading: (n: number) => `Needs restocking (${n})`,
    out: "Out of stock",
    low: "Low stock",
    viewAll: (n: number) => `View all ${n}`,
    empty: "Nothing needs restocking.",
    columns: { product: "Product", sku: "SKU", stock: "Stock", level: "Level" },
  },
  recent: {
    heading: "Recent orders",
    columns: {
      number: "Order",
      placed: "Placed",
      customer: "Customer",
      status: "Status",
      total: "Total",
    },
    viewAll: "View all orders",
    empty: "No orders yet.",
  },
  review: {
    heading: "Needs review",
    text: (n: number) =>
      n === 1
        ? "1 order needs payment review."
        : `${n} orders need payment review.`,
    empty: "Nothing needs review.",
  },
  error: "Couldn't load the dashboard. Try again.",
  retry: "Try again",
} as const
