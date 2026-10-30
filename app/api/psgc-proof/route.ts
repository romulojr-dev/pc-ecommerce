import { resolveAddress } from "@/lib/psgc/address"

// TEMPORARY (docs/specs/028-shipping-data-and-fee-rules, D20): proves on a
// Vercel deploy that a server function can read the address files. Deleted
// before the story merges.
export const dynamic = "force-dynamic"

export async function GET() {
  const address = await resolveAddress({
    regionCode: "1300000000",
    provinceCode: "1300000000",
    cityCode: "1381300000",
    barangayCode: "1381300001",
  })
  return Response.json(
    { ok: address !== null, address },
    { headers: { "Cache-Control": "no-store" } }
  )
}
