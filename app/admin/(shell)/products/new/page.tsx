import type { Metadata } from "next"
import Link from "next/link"
import { connection } from "next/server"

import { NoAccess } from "@/components/admin/no-access"
import { ProductForm } from "@/components/admin/product-form"
import { ADMIN_COPY } from "@/lib/admin/copy"
import { can } from "@/lib/admin/permissions"
import { emptyProductForm } from "@/lib/admin/product-form"
import { PRODUCT_COPY } from "@/lib/admin/products-copy"
import { listBrandOptions } from "@/lib/admin/queries/products"
import { requireAdminAccess } from "@/lib/admin/session"
import { builderCategories, isBuilderCategory } from "@/lib/specs"
import { first } from "@/lib/listing-filters/raw"
import { cn, focusRing } from "@/lib/utils"

export const metadata: Metadata = {
  title: { absolute: ADMIN_COPY.titles.products },
}

// A new product (docs/specs/045-admin-products-create-edit, B8–B13). No
// loading.tsx. Step 1 asks for the category, because the specification fields
// depend on it; an unknown or non-builder category goes back to that step.
export default async function AdminNewProductPage({
  searchParams,
}: PageProps<"/admin/products/new">) {
  await connection()
  const { session, allowed } = await requireAdminAccess("products.view")
  if (!allowed) return <NoAccess />

  const category = first((await searchParams).category)
  if (!category || !isBuilderCategory(category)) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold">
          {PRODUCT_COPY.categoryStep.heading}
        </h1>
        <p className="text-sm text-muted-foreground">
          {PRODUCT_COPY.categoryStep.hint}
        </p>
        <ul className="grid max-w-xl gap-2 sm:grid-cols-2">
          {Object.entries(builderCategories).map(([slug, { name }]) => (
            <li key={slug}>
              <Link
                href={`/admin/products/new?category=${slug}`}
                className={cn(
                  "block rounded-md border p-3 hover:bg-muted",
                  focusRing
                )}
              >
                {name}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  const role = session.user.adminRole
  const brands = await listBrandOptions(role)
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">{PRODUCT_COPY.form.newHeading}</h1>
      <ProductForm
        mode="create"
        initial={emptyProductForm(category)}
        brands={brands}
        readOnly={!can(role, "products.write")}
      />
    </div>
  )
}
