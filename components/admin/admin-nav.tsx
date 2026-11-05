"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ShoppingCartIcon } from "lucide-react"

import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { ADMIN_COPY } from "@/lib/admin/copy"

// The shell's navigation. One item for now: every role can use Orders, so
// "shows only what the role can use" holds without `can()`; #105 makes the
// list depend on the role (docs/specs/039-staff-sign-in-admin-shell, Rule 19).
const ITEMS = [
  {
    label: ADMIN_COPY.shell.ordersNav,
    href: "/admin/orders",
    icon: ShoppingCartIcon,
  },
]

export function AdminNav() {
  const pathname = usePathname()
  return (
    <SidebarMenu>
      {ITEMS.map(({ label, href, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`)
        return (
          <SidebarMenuItem key={href}>
            <SidebarMenuButton
              isActive={active}
              render={
                <Link href={href} aria-current={active ? "page" : undefined} />
              }
            >
              <Icon aria-hidden="true" />
              <span>{label}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        )
      })}
    </SidebarMenu>
  )
}
