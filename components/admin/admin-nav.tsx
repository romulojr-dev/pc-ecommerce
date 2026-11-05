"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ShoppingCartIcon, UsersIcon } from "lucide-react"

import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

// The shell navigation. The server decides which items the role can open
// (navItemsFor, the same can() as the server checks) and passes them in; the
// icons live here because a component cannot cross from server to client.
const ICONS = { orders: ShoppingCartIcon, customers: UsersIcon } as const

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
