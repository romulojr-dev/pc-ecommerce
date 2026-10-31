import { randomUUID } from "node:crypto"

import { db } from "@/lib/db"
import type { DbClient } from "@/lib/db-client"
import { toDateString } from "@/lib/products"
import {
  getStockStatus,
  isBuyable,
  manilaToday,
  type StockStatus,
} from "@/lib/stock"

import { capQuantity, MAX_CART_QUANTITY } from "./cap"
import { cartCount } from "./count"
import {
  type FlagProduct,
  flaggedCount,
  groupPartFlags,
  isUnavailable,
  productFlags,
  setToQuantity,
} from "./flags"
import { newCartId } from "./id"
import { addInputSchema, removeInputSchema, setInputSchema } from "./input"
import {
  type CartOutcome,
  failed,
  logFailure,
  lockCart,
  quantityInGroups,
  touch,
  type Tx,
} from "./tx"
import { loadGroups } from "./groups"
import type { CartEntry, CartLineView, CartView } from "./types"

export type { CartOutcome } from "./tx"

// The cart (docs/specs/025-cart-single-items). The server actions only forward
// to these functions, and the integration tests call them directly with a
// cart id. Anyone can reach the actions, so every function checks its own
// input, and the cart always comes from the cookie's id, never from the
// request body.

type Options = {
  // The id from the cookie, or null when there is none or it isn't shaped
  // like one
  cartId: string | null
  // Manila's date, for pre-order status; tests pass a fixed one
  today?: string
}

const productFacts = (tx: Tx, productId: string) =>
  tx.product.findUnique({
    where: { id: productId },
    select: {
      status: true,
      stock: true,
      lowStockAt: true,
      preorderShipsOn: true,
    },
  })

type Facts = NonNullable<Awaited<ReturnType<typeof productFacts>>>

function stockStatusOf(product: Facts, today: string): StockStatus {
  return getStockStatus(
    {
      stock: product.stock,
      lowStockAt: product.lowStockAt,
      preorderShipsOn: toDateString(product.preorderShipsOn),
    },
    today
  )
}

// Active and buyable now: the only parts that can be added (spec 020 D7)
const isSold = (product: Facts, today: string) =>
  product.status === "ACTIVE" && isBuyable(stockStatusOf(product, today))

// Adds units of a product to the cart (Behavior 7–10, Rules › Stock cap). The
// cart is made here, on the first add, or when the cookie's cart is gone.
export async function addToCart(
  input: unknown,
  { cartId, today = manilaToday() }: Options,
  newId: () => string = newCartId
): Promise<CartOutcome> {
  const parsed = addInputSchema.safeParse(input)
  if (!parsed.success) return failed("invalid")
  const { productId, quantity: requested } = parsed.data

  try {
    return await db.$transaction(async (tx): Promise<CartOutcome> => {
      const product = await productFacts(tx, productId)
      if (!product || !isSold(product, today)) return failed("unavailable")

      let id = cartId
      if (!id || !(await lockCart(tx, id))) {
        id = newId()
        await tx.$executeRaw`
          INSERT INTO "Cart" ("id", "updatedAt") VALUES (${id}, now())`
      }

      const single = await tx.cartItem.findFirst({
        where: { cartId: id, productId, buildId: null },
        select: { id: true, quantity: true },
      })
      const before = single?.quantity ?? 0
      const { quantity, note } = capQuantity({
        op: "add",
        requested,
        line: before,
        others: await quantityInGroups(tx, id, productId),
        stock: product.stock,
      })

      let line = single
      if (quantity > 0) {
        // The one single line per product per cart is the partial unique
        // index, so adding is one upsert on it
        const rows = await tx.$queryRaw<{ id: string; quantity: number }[]>`
          INSERT INTO "CartItem" ("id", "cartId", "productId", "quantity")
          VALUES (${randomUUID()}, ${id}, ${productId}, ${quantity}::integer)
          ON CONFLICT ("cartId", "productId") WHERE "buildId" IS NULL
          DO UPDATE SET "quantity" = EXCLUDED."quantity"
          RETURNING "id", "quantity"`
        line = rows[0]
      }

      return {
        cartId: id,
        // A capped add that added nothing still shows the cart is in use
        renewCookie: true,
        result: {
          ok: true,
          count: await touch(tx, id),
          line: line ? { id: line.id, quantity: line.quantity } : null,
          added: quantity - before,
          ...(note && { note }),
        },
      }
    })
  } catch (error) {
    logFailure("addToCart", error)
    return failed("error")
  }
}

// Sets a single line to an absolute quantity (Behavior 19–20). Lowering
// always works; raising needs the product to be sold and fits the cap.
export async function setCartQuantity(
  input: unknown,
  { cartId, today = manilaToday() }: Options
): Promise<CartOutcome> {
  const parsed = setInputSchema.safeParse(input)
  if (!parsed.success) return failed("invalid")
  if (!cartId) return failed("not-found")
  const { lineId, quantity: requested } = parsed.data

  try {
    return await db.$transaction(async (tx): Promise<CartOutcome> => {
      if (!(await lockCart(tx, cartId))) return failed("not-found")

      // Only this cart's single lines: another cart's id, or a line of a
      // build group, is not found (E23–E25)
      const row = await tx.cartItem.findFirst({
        where: { id: lineId, cartId, buildId: null },
        select: { id: true, productId: true, quantity: true },
      })
      if (!row) return failed("not-found")

      const product = await productFacts(tx, row.productId)
      if (!product) return failed("not-found")
      if (requested > row.quantity && !isSold(product, today)) {
        return failed("unavailable")
      }

      const { quantity, note } = capQuantity({
        op: "set",
        requested,
        line: row.quantity,
        others: await quantityInGroups(tx, cartId, row.productId),
        stock: product.stock,
      })
      if (quantity !== row.quantity) {
        await tx.cartItem.update({ where: { id: row.id }, data: { quantity } })
      }

      return {
        cartId,
        renewCookie: true,
        result: {
          ok: true,
          count: await touch(tx, cartId),
          line: { id: row.id, quantity },
          ...(note && { note }),
        },
      }
    })
  } catch (error) {
    logFailure("setCartQuantity", error)
    return failed("error")
  }
}

// Removes a single line (Behavior 21). Never checks the product: a shopper can
// always take a part out.
export async function removeFromCart(
  input: unknown,
  { cartId }: Options
): Promise<CartOutcome> {
  const parsed = removeInputSchema.safeParse(input)
  if (!parsed.success) return failed("invalid")
  if (!cartId) return failed("not-found")
  const { lineId } = parsed.data

  try {
    return await db.$transaction(async (tx): Promise<CartOutcome> => {
      if (!(await lockCart(tx, cartId))) return failed("not-found")

      const { count: removed } = await tx.cartItem.deleteMany({
        where: { id: lineId, cartId, buildId: null },
      })
      if (removed === 0) return failed("not-found")

      return {
        cartId,
        renewCookie: true,
        result: { ok: true, count: await touch(tx, cartId), line: null },
      }
    })
  } catch (error) {
    logFailure("removeFromCart", error)
    return failed("error")
  }
}

// The header's number (Behavior 12–13). No cart, or an unknown one, is 0.
export async function getCartCount(cartId: string | null): Promise<number> {
  if (!cartId) return 0
  return cartCount(
    await db.cartItem.findMany({
      where: { cartId },
      select: { quantity: true, buildId: true },
    })
  )
}

// What /cart shows (Behavior 17–25): every single-item line with its product
// read fresh, and every build group (spec 026), oldest first. Prices come
// from the products, never from the cart.
export async function getCartView(
  cartId: string | null,
  today: string = manilaToday(),
  // A placement reads inside its transaction (docs/specs/030-place-an-order)
  client: DbClient = db
): Promise<CartView> {
  if (!cartId) return { entries: [], subtotal: 0, count: 0, flagged: 0 }

  const rows = await client.cartItem.findMany({
    where: { cartId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      productId: true,
      quantity: true,
      buildId: true,
      product: {
        select: {
          name: true,
          slug: true,
          price: true,
          salePrice: true,
          effectivePrice: true,
          stock: true,
          lowStockAt: true,
          preorderShipsOn: true,
          status: true,
          brand: { select: { name: true } },
          category: { select: { slug: true } },
          images: {
            select: { url: true, alt: true },
            orderBy: { sortOrder: "asc" },
            take: 1,
          },
        },
      },
    },
  })

  const inGroups = new Map<string, number>()
  for (const row of rows) {
    if (row.buildId === null) continue
    inGroups.set(
      row.productId,
      (inGroups.get(row.productId) ?? 0) + row.quantity
    )
  }

  // Stock flags (spec 027): a product's state from the whole cart's lines,
  // shown on every line that holds it
  const products = new Map<string, FlagProduct>()
  for (const { productId, product } of rows) {
    if (products.has(productId)) continue
    products.set(productId, {
      active: product.status === "ACTIVE",
      status: stockStatusOf(product, today),
      stock: product.stock,
    })
  }
  const flags = productFlags(rows, products)

  const groups = await loadGroups(
    [...new Set(rows.flatMap((row) => (row.buildId ? [row.buildId] : [])))],
    today,
    client
  )

  // Rows are oldest first, so a group sits where its first line was added
  const entries: CartEntry[] = []
  const seenGroups = new Set<string>()
  for (const { id, productId, quantity, buildId, product } of rows) {
    if (buildId !== null) {
      const group = groups.get(buildId)
      if (group && !seenGroups.has(buildId)) {
        seenGroups.add(buildId)
        entries.push({
          kind: "build",
          number: null,
          ...group,
          flags: groupPartFlags(group.slots, flags),
        })
      }
      continue
    }
    const sold = product.status === "ACTIVE"
    const flag = flags.get(productId) ?? null
    const room =
      Math.min(product.stock, MAX_CART_QUANTITY) -
      (inGroups.get(productId) ?? 0)
    entries.push({
      kind: "single",
      id,
      productId,
      name: product.name,
      slug: product.slug,
      categorySlug: product.category.slug,
      brand: product.brand.name,
      image: product.images[0] ?? null,
      price: product.price,
      salePrice: product.salePrice,
      unitPrice: product.effectivePrice,
      quantity,
      lineTotal: product.effectivePrice * quantity,
      status: stockStatusOf(product, today),
      preorderShipsOn: toDateString(product.preorderShipsOn),
      sold,
      // An unavailable line can't be raised, even when stock is left
      max: sold && !isUnavailable(flag) ? Math.max(quantity, room) : quantity,
      flag,
      setTo: setToQuantity(flag, quantity),
    } satisfies CartLineView)
  }

  // Groups are told apart by number only when there are two or more
  const builds = entries.filter((entry) => entry.kind === "build")
  if (builds.length > 1)
    builds.forEach((group, index) => (group.number = index + 1))

  return {
    entries,
    subtotal: entries.reduce(
      (sum, entry) =>
        entry.kind === "build"
          ? sum + entry.total
          : entry.sold
            ? sum + entry.lineTotal
            : sum,
      0
    ),
    count: cartCount(rows),
    flagged: flaggedCount(entries),
  }
}
