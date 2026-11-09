import type { Page } from "@playwright/test"

import { authFile } from "./accounts"
import {
  ALPHA,
  BETA,
  imageRows,
  insertImageFixtures,
  picture,
  removeImageFixtures,
  SKU_PREFIX,
  storeUrl,
} from "./admin-images-fixtures"
import { expect, test } from "./test"

// docs/specs/049-product-images-upload: the owner adds two photos at once,
// edits an alt text, makes the second photo the main image, sees them on the
// store, removes them and sees the placeholder come back; Demo sees the
// section read-only and cannot upload. The products are throwaway (SKU
// prefix) and removed before and after; the server runs IMAGE_STORAGE=fake.
// One worker: the tests share the fixtures and each builds on the one before.

test.describe.configure({ mode: "serial" })

let category = "cpu"
test.beforeAll(async () => {
  category = await insertImageFixtures()
})
test.afterAll(removeImageFixtures)

const editUrl = (id: string) => `/admin/products/${id}`

async function loaded(page: Page, selector: string) {
  await expect
    .poll(
      () =>
        page
          .locator(selector)
          .evaluateAll((images) =>
            images.every(
              (img) =>
                (img as HTMLImageElement).complete &&
                (img as HTMLImageElement).naturalWidth > 0
            )
          ),
      { timeout: 20_000 }
    )
    .toBe(true)
}

test.describe("owner", () => {
  test.use({ storageState: authFile("owner") })

  test("the no-photos filter lists the new products, with their placeholder", async ({
    page,
  }) => {
    await page.goto(`/admin/products?q=${SKU_PREFIX}&photos=missing`)
    await expect(page.getByRole("link", { name: ALPHA.name })).toBeVisible()
    await expect(page.getByRole("link", { name: BETA.name })).toBeVisible()
    await expect(page.getByLabel("Photos")).toHaveValue("missing")
    await expect(page.getByText("No photo", { exact: true })).toHaveCount(2)
  })

  test("a product without photos shows its placeholder on the store", async ({
    page,
  }) => {
    await page.goto(storeUrl(category, ALPHA))
    const image = page.getByRole("img", { name: ALPHA.name })
    await expect(image.first()).toBeVisible()
    await expect(image.first()).toHaveAttribute(
      "src",
      /placeholders%2Fcpu|cpu\.svg/
    )
    // The placeholder is not something to enlarge
    await expect(
      page.getByRole("button", { name: "Enlarge image" })
    ).toHaveCount(0)
    // The footer says the images are for illustration
    await expect(
      page.getByText(
        "PC Silicon is a demo store. Product images are for illustration."
      )
    ).toBeVisible()
  })

  test("uploads two photos at once, in order, with the product name as alt", async ({
    page,
  }) => {
    await page.goto(editUrl(ALPHA.id))
    await expect(
      page.getByText(
        "No photos yet. The store shows the CPU placeholder until you add one."
      )
    ).toBeVisible()

    await page
      .getByLabel("Add photos")
      .setInputFiles([
        await picture("teal", "first.png"),
        await picture("crimson", "second.png"),
      ])
    await expect(page.getByText("first.png added.")).toBeVisible({
      timeout: 20_000,
    })
    await expect(page.getByText("second.png added.")).toBeVisible()
    await expect(page.getByText("Photos added.")).toBeVisible()
    // Another product still has none, so the link offers it
    await expect(
      page.getByRole("link", { name: /^Next product without photos: / })
    ).toBeVisible()

    const rows = await imageRows(ALPHA.id)
    expect(rows).toHaveLength(2)
    expect(rows.map((row) => row.sortOrder)).toEqual([0, 1])
    expect(rows.every((row) => row.alt === ALPHA.name)).toBe(true)
    expect(rows[0].url).toMatch(/^\/test-images\/[\w-]{22}\.webp$/)

    // One main image badge, on the first row
    await expect(page.getByText("Main image", { exact: true })).toHaveCount(1)
  })

  test("a refused file does not stop the others", async ({ page }) => {
    await page.goto(editUrl(BETA.id))
    await page.getByLabel("Add photos").setInputFiles([
      {
        name: "logo.svg",
        mimeType: "image/png",
        buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
      },
      await picture("navy", "ok.png"),
    ])
    await expect(
      page.getByText(
        "logo.svg: Only JPEG, PNG and WebP photos can be uploaded."
      )
    ).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText("ok.png added.")).toBeVisible()
    expect(await imageRows(BETA.id)).toHaveLength(1)
  })

  test("edits an alt text and makes the second photo the main image", async ({
    page,
  }) => {
    await page.goto(editUrl(ALPHA.id))
    const second = page.getByLabel("Alt text").nth(1)
    await second.fill("E2E second photo")
    await page.getByRole("button", { name: "Save alt text" }).click()
    await expect(page.getByText("Alt text saved.")).toBeAttached()

    await page
      .getByRole("button", { name: "Make photo 2 the main image" })
      .click()
    await expect(page.getByLabel("Alt text").first()).toHaveValue(
      "E2E second photo"
    )
    const rows = await imageRows(ALPHA.id)
    expect(rows.map((row) => row.alt)).toEqual(["E2E second photo", ALPHA.name])
  })

  test("the store shows the photos: the main one first, with its alt, loaded", async ({
    page,
  }) => {
    await page.goto(storeUrl(category, ALPHA))
    const main = page.getByRole("img", { name: "E2E second photo" })
    await expect(main.first()).toBeVisible()
    await loaded(page, 'img[alt="E2E second photo"]')
    // Two photos: thumbnails and an Enlarge image button
    await expect(
      page.getByRole("button", { name: "Show image 2 of 2" })
    ).toBeVisible()
    await expect(
      page.getByRole("button", { name: "Enlarge image" })
    ).toBeVisible()
  })

  test("a product with one photo shows no thumbnail strip", async ({
    page,
  }) => {
    await page.goto(storeUrl(category, BETA))
    await expect(
      page.getByRole("button", { name: "Enlarge image" })
    ).toBeVisible()
    await expect(page.getByRole("button", { name: /^Show image/ })).toHaveCount(
      0
    )
    await loaded(page, `img[alt="${BETA.name}"]`)
  })

  test("the no-photos filter no longer lists a product that has photos", async ({
    page,
  }) => {
    await page.goto(`/admin/products?q=${SKU_PREFIX}&photos=missing`)
    await expect(page.getByText("No products match your search.")).toBeVisible()
  })

  test("removing the last photo brings the placeholder back", async ({
    page,
  }) => {
    await page.goto(editUrl(BETA.id))
    await page.getByRole("button", { name: "Remove photo 1" }).click()
    const dialog = page.getByRole("dialog")
    await expect(dialog.getByText("Remove this photo?")).toBeVisible()
    await expect(
      dialog.getByText("The store will show the CPU placeholder again.")
    ).toBeVisible()
    await dialog.getByRole("button", { name: "Remove photo" }).click()
    await expect(
      page.getByText(
        "No photos yet. The store shows the CPU placeholder until you add one."
      )
    ).toBeVisible({ timeout: 20_000 })
    expect(await imageRows(BETA.id)).toHaveLength(0)

    await page.goto(storeUrl(category, BETA))
    await expect(
      page.getByRole("img", { name: BETA.name }).first()
    ).toHaveAttribute("src", /cpu/)
  })

  test("removing one of two photos makes the other main", async ({ page }) => {
    await page.goto(editUrl(ALPHA.id))
    await page.getByRole("button", { name: "Remove photo 1" }).click()
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Remove photo" })
      .click()
    // The dialog closes when the removal has gone through (while it is open
    // the page behind it is hidden from the accessibility tree), then the
    // second row is gone
    await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 20_000 })
    await expect(
      page.getByRole("button", { name: "Remove photo 2" })
    ).toHaveCount(0, { timeout: 20_000 })
    await expect(page.getByText("Main image", { exact: true })).toHaveCount(1)
    const rows = await imageRows(ALPHA.id)
    expect(rows).toHaveLength(1)
    expect(rows[0].sortOrder).toBe(0)
    expect(rows[0].alt).toBe(ALPHA.name)
  })

  test("a request made by hand is refused by type, by bytes", async ({
    page,
    baseURL,
  }) => {
    const response = await page.request.post(
      `/api/admin/images?kind=product&id=${ALPHA.id}`,
      {
        headers: { origin: baseURL ?? "http://localhost:3000" },
        data: Buffer.from("%PDF-1.7 not a photo"),
      }
    )
    expect(response.status()).toBe(400)
    expect((await response.json()).message).toBe(
      "Only JPEG, PNG and WebP photos can be uploaded."
    )
  })
})

test.describe("demo", () => {
  test.use({ storageState: authFile("demo") })

  test("sees the Photos section read-only, and the upload is refused", async ({
    page,
    baseURL,
  }) => {
    await page.goto(editUrl(ALPHA.id))
    await expect(page.getByRole("heading", { name: "Photos" })).toBeVisible()
    await expect(
      page.getByText("This account is read-only.").first()
    ).toBeVisible()
    await expect(page.getByLabel("Add photos")).toBeDisabled()
    await expect(
      page.getByRole("button", { name: /^Remove photo/ })
    ).toBeDisabled()

    const before = await imageRows(ALPHA.id)
    const response = await page.request.post(
      `/api/admin/images?kind=product&id=${ALPHA.id}`,
      {
        headers: { origin: baseURL ?? "http://localhost:3000" },
        data: (await picture("gold", "x.png")).buffer,
      }
    )
    expect(response.status()).toBe(403)
    expect((await response.json()).message).toBe("This account is read-only")
    expect(await imageRows(ALPHA.id)).toEqual(before)
  })
})
