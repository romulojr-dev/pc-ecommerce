import type { APIRequestContext, Page } from "@playwright/test"

// Saved builds for the specs that need one. Not a spec itself: Playwright
// only runs *.spec.ts files. A fresh browser context starts with no saved
// build, so these set it on the page under test.

export const SAVED_BUILD = "pc-silicon-build"

// Spec 001's compatible build (docs/specs/001-spec-schemas-and-seed)
export const BUILD_A: readonly (readonly [string, string])[] = [
  ["cpu", "AMD Ryzen 5 7600"],
  ["motherboard", "ASUS ROG Strix B650-A Gaming WiFi"],
  ["memory", "Corsair Vengeance DDR5-6000 32 GB (2×16 GB) CL30"],
  ["storage", "Samsung 990 PRO 1TB NVMe SSD"],
  ["gpu", "ASUS Dual GeForce RTX 4060 OC Edition 8GB"],
  ["case", "Lian Li LANCOOL 216 Black"],
  ["psu", "Cooler Master MWE 550 Bronze V2"],
  ["cpu-cooler", "Thermalright Peerless Assassin 120 SE"],
]

export type SavedItem = { slot: string; productId: string; quantity: number }

type Candidates = {
  candidates: { data: { part: { id: string; name: string } } }[]
}

// The saved items for Build A, with the real product ids: the slot picker's
// candidates route lists every active part of a slot
export async function buildAItems(
  request: APIRequestContext
): Promise<SavedItem[]> {
  return Promise.all(
    BUILD_A.map(async ([slot, name]) => {
      const response = await request.get(`/api/builder/candidates?slot=${slot}`)
      const { candidates } = (await response.json()) as Candidates
      const found = candidates.find(({ data }) => data.part.name === name)
      if (!found) throw new Error(`no ${slot} named ${name} in the database`)
      return { slot, productId: found.data.part.id, quantity: 1 }
    })
  )
}

// Saves the items for the page's origin, then reloads so the page reads them
export async function saveBuild(page: Page, items: SavedItem[]) {
  await page.evaluate(
    ([key, value]) => localStorage.setItem(key, value),
    [SAVED_BUILD, JSON.stringify({ state: { items }, version: 1 })]
  )
  await page.reload()
}
