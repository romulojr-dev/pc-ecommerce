import { db } from "@/lib/db"
import { env } from "@/lib/env"

// The fake photo store's files (docs/specs/049-product-images-upload, R14,
// E44, E45). A 404 unless IMAGE_STORAGE=fake, whatever the table holds, and
// for a name nobody uploaded. The name is one path segment of letters,
// digits, `_`, `-` and `.`.
const NAME = /^[A-Za-z0-9_.-]{1,80}$/

const notFound = () =>
  new Response("Not found", {
    status: 404,
    headers: { "Cache-Control": "no-store" },
  })

export async function GET(
  _request: Request,
  ctx: RouteContext<"/test-images/[name]">
) {
  if (env.IMAGE_STORAGE !== "fake") return notFound()
  const { name } = await ctx.params
  if (!NAME.test(name)) return notFound()

  const file = await db.fakeStoredImage.findUnique({ where: { name } })
  if (!file) return notFound()
  return new Response(new Uint8Array(file.bytes), {
    headers: {
      "Content-Type": file.contentType,
      // File names are random and never reused
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  })
}
