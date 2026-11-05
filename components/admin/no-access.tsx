import Link from "next/link"

import { ADMIN_COPY } from "@/lib/admin/copy"

// What a role sees on an admin page its view action doesn't allow
// (docs/specs/040-admin-permissions-audit-masking, Behavior 3). It reads no
// data; the page returns it before loading anything.
export function NoAccess() {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold">{ADMIN_COPY.noAccess.heading}</h1>
      <p className="text-muted-foreground">{ADMIN_COPY.noAccess.body}</p>
      <p>
        <Link href="/admin/orders" className="underline underline-offset-4">
          {ADMIN_COPY.noAccess.link}
        </Link>
      </p>
    </div>
  )
}
