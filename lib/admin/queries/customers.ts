import "server-only"

import { db } from "@/lib/db"

import { type ContactView, contactView } from "../mask"
import type { AdminRole } from "../permissions"
import { assertCan } from "./guard"

// Customers as Admin lists them (docs/specs/040-admin-permissions-audit-
// masking, R17). There is no customer table: a customer is a distinct guest
// email on orders. The rows are grouped by the real email here, but a Demo
// row carries no key that could reveal it: its id is the row's position.

export type CustomerRow = {
  // Owner and Staff: the lower-cased email, the key of the history page. Demo:
  // an opaque position, "c1", "c2", ...
  id: string
  contact: ContactView
  orderCount: number
  // Centavos over all the customer's orders
  totalSpent: number
  lastOrderAt: Date
}

const CUSTOMER_LIMIT = 200

export async function listCustomers(role: AdminRole): Promise<CustomerRow[]> {
  assertCan(role, "customers.view")
  const orders = await db.order.findMany({
    select: {
      guestEmail: true,
      contactName: true,
      contactMobile: true,
      total: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 5000,
  })
  const byEmail = new Map<string, CustomerRow>()
  for (const order of orders) {
    const key = order.guestEmail.trim().toLowerCase()
    const found = byEmail.get(key)
    if (found) {
      found.orderCount += 1
      found.totalSpent += order.total
    } else {
      byEmail.set(key, {
        id: key,
        // The newest order's details, since the list is newest first
        contact: contactView(role, order),
        orderCount: 1,
        totalSpent: order.total,
        lastOrderAt: order.createdAt,
      })
    }
  }
  return [...byEmail.values()].slice(0, CUSTOMER_LIMIT).map((row, index) => ({
    ...row,
    id: role === "demo" ? `c${index + 1}` : row.id,
  }))
}
