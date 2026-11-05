"use server"

import { markAdminFunction } from "@/lib/admin/marker"

// Marked by hand, as adminAction will: the passing case for the scanner.
export const guardedAction = markAdminFunction(async () => "ok", "orders.view")
