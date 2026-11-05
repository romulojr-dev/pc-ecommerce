import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { connection } from "next/server"

import { CustomerListView } from "@/components/admin/customer-list"
import { CustomerSearch } from "@/components/admin/customer-search"
import { NoAccess } from "@/components/admin/no-access"
import { ADMIN_COPY } from "@/lib/admin/copy"
import {
  customersHref,
  isCanonicalCustomerQuery,
  parseCustomerParams,
} from "@/lib/admin/customers-params"
import { can } from "@/lib/admin/permissions"
import { listCustomers } from "@/lib/admin/queries/customers"
import { requireAdminAccess } from "@/lib/admin/session"

export const metadata: Metadata = {
  title: { absolute: ADMIN_COPY.titles.customers },
}

// The customer list (docs/specs/042-admin-customers). Search and page live in
// the URL; a URL that isn't the canonical one redirects to it, and a page past
// the last redirects to the last. Data comes only from the query layer, which
// masks customer fields for Demo and refuses Demo's search.
export default async function AdminCustomersPage({
  searchParams,
}: PageProps<"/admin/customers">) {
  await connection()
  const { session, allowed } = await requireAdminAccess("customers.view")
  if (!allowed) return <NoAccess />

  const raw = await searchParams
  const params = parseCustomerParams(raw)
  if (!isCanonicalCustomerQuery(raw, params)) redirect(customersHref(params))

  const role = session.user.adminRole
  const result = await listCustomers(role, params)
  if (result.ok && result.total > 0 && result.page !== params.page) {
    redirect(customersHref({ ...params, page: result.page }))
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">{ADMIN_COPY.customers.heading}</h1>
      <CustomerSearch
        params={params}
        canSearch={can(role, "orders.search-customer")}
      />
      {result.ok ? (
        <CustomerListView data={result} params={params} />
      ) : (
        <p role="alert" className="rounded-md border p-4">
          {result.message}
        </p>
      )}
    </div>
  )
}
