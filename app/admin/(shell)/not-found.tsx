import type { Metadata } from "next"
import Link from "next/link"

import { ADMIN_COPY } from "@/lib/admin/copy"

export const metadata: Metadata = {
  title: { absolute: ADMIN_COPY.titles.notFound },
}

export default function AdminNotFound() {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold">{ADMIN_COPY.notFound.heading}</h1>
      <p>
        <Link href="/admin/orders" className="underline underline-offset-4">
          {ADMIN_COPY.notFound.link}
        </Link>
      </p>
    </div>
  )
}
