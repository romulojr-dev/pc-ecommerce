import { LogoMark } from "@/components/layout/logo"
import { AdminNav } from "@/components/admin/admin-nav"
import { SignOutButton } from "@/components/admin/sign-out-button"
import { Separator } from "@/components/ui/separator"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { ADMIN_COPY, roleLabel } from "@/lib/admin/copy"
import { navItemsFor } from "@/lib/admin/nav"
import type { AdminSession } from "@/lib/admin/session"

// The frame of every admin page except the sign-in form: a sidebar with the
// shop name and the navigation, a header with who is signed in and Sign out
// (docs/specs/039-staff-sign-in-admin-shell, Rule 19). Takes the person, so
// the markup is testable without a session.
export function AdminShell({
  user,
  children,
}: {
  user: AdminSession["user"]
  children: React.ReactNode
}) {
  return (
    <SidebarProvider>
      <Sidebar aria-label={ADMIN_COPY.shell.navLabel}>
        <SidebarHeader>
          <div className="flex items-center gap-2 px-2 py-1.5 text-base">
            <LogoMark className="size-7" />
            <span>
              <span className="font-bold">pc</span>silicon{" "}
              <span className="text-muted-foreground">Admin</span>
            </span>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <AdminNav
                items={navItemsFor(user.adminRole).map(
                  ({ key, label, href }) => ({
                    key,
                    label,
                    href,
                  })
                )}
              />
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4 print:hidden">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="h-4" />
          <div className="ml-auto flex items-center gap-3">
            {user.adminRole === "demo" ? (
              <p
                className="text-sm text-muted-foreground"
                data-testid="admin-demo-notice"
              >
                {ADMIN_COPY.shell.demoNotice}
              </p>
            ) : null}
            <p className="text-sm" data-testid="admin-person">
              <span className="font-medium">{user.name}</span>{" "}
              <span className="text-muted-foreground">
                · {roleLabel(user.role)}
              </span>
            </p>
            <SignOutButton />
          </div>
        </header>
        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 p-6 outline-none"
        >
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
