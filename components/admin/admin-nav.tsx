"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  PackageIcon,
  ScrollTextIcon,
  ShoppingCartIcon,
  UsersIcon,
  WarehouseIcon,
} from "lucide-react"

import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

// The shell navigation. The server decides which items the role can open
// (navItemsFor, the same can() as the server checks) and passes them in; the
// icons live here because a component cannot cross from server to client.
const ICONS = {
  products: PackageIcon,
  inventory: WarehouseIcon,
  orders: ShoppingCartIcon,
  customers: UsersIcon,
  audit: ScrollTextIcon,
} as const

export type AdminNavItem = {
  key: keyof typeof ICONS
  label: string
  href: string
}

export function AdminNav({ items }: { items: AdminNavItem[] }) {
  const pathname = usePathname()
  return (
    <SidebarMenu>
      {items.map(({ key, label, href }) => {
        const Icon = ICONS[key]
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
