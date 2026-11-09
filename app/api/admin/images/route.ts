import { revalidateTag } from "next/cache"
import { z } from "zod"

import { adminRoute } from "@/lib/admin/guard"
import { IMAGE_REASONS } from "@/lib/admin/images-copy"
import { uploadProductImage } from "@/lib/admin/images/upload"
import { PRODUCTS_TAG } from "@/lib/home"

// Uploads one product photo (docs/specs/049-product-images-upload, B14–B17).
// The body is the file itself (not multipart), one request per file, so each
// stays under Vercel's 4.5 MB limit. Built with adminRoute: the origin, the
// session and `can("images.write")` are checked before the body is read, so
// Demo's request is refused without reading a byte. `kind=brand` comes with
// the brands screen (#115).
// Decoding and re-encoding a large photo can take a few seconds
export const maxDuration = 30

const querySchema = z.object({
  kind: z.literal("product"),
  id: z.string().regex(/^[a-z0-9]{10,40}$/),
})

export const POST = adminRoute("images.write", async ({ actor, request }) => {
  const { searchParams } = new URL(request.url)
  const query = querySchema.safeParse({
    kind: searchParams.get("kind"),
    id: searchParams.get("id"),
  })
  if (!query.success) {
    return Response.json(
      { ok: false, error: "target", message: IMAGE_REASONS.target },
      { status: 400 }
    )
  }

  const result = await uploadProductImage(actor, {
    productId: query.data.id,
    contentLength: request.headers.get("content-length"),
    body: request.body,
  })
  if (result.kind === "refused") {
    return Response.json(
      { ok: false, error: result.error, message: result.message },
      { status: result.status }
    )
  }
  // After the commit; the actions use updateTag, a route handler cannot
  revalidateTag(PRODUCTS_TAG, "max")
  return Response.json({ ok: true, image: result.image }, { status: 201 })
})
