"use server"

import { markAdminFunction } from "@/lib/admin/marker"

// Marked, but with an action the permission table doesn't have: the check on
// markers must report it. Never imported by the app.
export const refundAction = markAdminFunction(async () => 1, "orders.refund")
