import type { Metadata } from "next"
import { connection } from "next/server"

import { Container } from "@/components/layout/container"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { db } from "@/lib/db"
import { formatPeso } from "@/lib/format"
import { getStockStatus, stockStatusLabel } from "@/lib/stock"

export const metadata: Metadata = {
  title: "Products",
}

// Temporary list of the catalog (docs/specs/004-product-list), until the
// Catalog epic's category pages replace it
export default async function ProductsPage() {
  // Render on every request: production is seeded after deploy, and stock
  // changes at runtime, so a list prerendered at build time would be stale
  await connection()

  const products = await db.product.findMany({
    where: { status: "ACTIVE" },
    select: {
      id: true,
      name: true,
      price: true,
      stock: true,
      lowStockAt: true,
      brand: { select: { name: true } },
      category: { select: { name: true } },
    },
    orderBy: [{ category: { name: "asc" } }, { name: "asc" }],
  })

  return (
    <Container className="py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
      {products.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">No products yet.</p>
      ) : (
        <Table className="mt-6 text-sm">
          <TableCaption>Active products in the catalog</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Brand</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead>Stock</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.map((product) => (
              <TableRow key={product.id}>
                <TableCell className="font-medium">{product.name}</TableCell>
                <TableCell>{product.brand.name}</TableCell>
                <TableCell>{product.category.name}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatPeso(product.price)}
                </TableCell>
                <TableCell>
                  {stockStatusLabel[getStockStatus(product)]}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Container>
  )
}
