import type { Page } from "@playwright/test"

import { expect, test } from "./test"

// The PC Builder page and Add to build (docs/specs/020-builder-page). Needs a
// seeded database. Every test starts with an empty saved build: each gets a
// fresh browser context, so localStorage is empty.

const RYZEN = "/cpu/amd-ryzen-5-7600"
const I5 = "/cpu/intel-core-i5-14400f"
const STRIX = "/motherboard/asus-rog-strix-b650-a-gaming-wifi"
const B760M = "/motherboard/msi-pro-b760m-a-wifi-ddr4"
const VENGEANCE = "/memory/corsair-vengeance-ddr5-6000-32-gb-2-16-gb-cl30"
const STORAGE_KEY = "pc-silicon-build"

// Adds the product on `path` to the build from its product page
async function addToBuild(page: Page, path: string) {
  await page.goto(path)
  await page.getByRole("button", { name: "Add to build" }).click()
}

const slot = (page: Page, name: string) =>
  page.getByRole("listitem").filter({
    has: page.getByRole("heading", { name, exact: true }),
  })

const summary = (page: Page) =>
  page.getByRole("complementary", { name: "Your build" })

test("a part added on its product page is in the build, after a reload too", async ({
  page,
}) => {
  await addToBuild(page, RYZEN)
  await expect(page.getByRole("status")).toContainText("Added to your build.")
  await page.getByRole("link", { name: "View build" }).click()

  await expect(page).toHaveURL("/builder")
  const cpu = slot(page, "CPU")
  await expect(
    cpu.getByRole("link", { name: "AMD Ryzen 5 7600", exact: true })
  ).toBeVisible()
  await expect(summary(page)).toContainText("₱11,495.00")
  await expect(summary(page)).toContainText("Estimated power: 114 W")
  await expect(summary(page)).toContainText("No compatibility issues found.")

  await page.reload()
  await expect(
    cpu.getByRole("link", { name: "AMD Ryzen 5 7600", exact: true })
  ).toBeVisible()
  await expect(summary(page)).toContainText("₱11,495.00")
})

test("an empty build offers a link for every slot", async ({ page }) => {
  await page.goto("/builder")
  for (const name of [
    "Choose a CPU",
    "Choose a motherboard",
    "Choose memory",
    "Choose storage",
    "Choose a graphics card",
    "Choose a case",
    "Choose a power supply",
    "Choose a CPU cooler",
  ]) {
    await expect(page.getByRole("link", { name, exact: true })).toBeVisible()
  }
  await expect(summary(page)).toContainText("Add parts to check compatibility.")
  await expect(
    summary(page).getByRole("button", { name: "Add build to cart" })
  ).toBeDisabled()

  await page.getByRole("link", { name: "Choose a CPU", exact: true }).click()
  await expect(page).toHaveURL("/cpu")
})

test("replacing a part asks first", async ({ page }) => {
  await addToBuild(page, RYZEN)
  await addToBuild(page, I5)

  const dialog = page.getByRole("dialog", {
    name: "Replace the CPU in your build?",
  })
  await expect(dialog).toContainText(
    "This replaces the CPU you picked with the Intel Core i5-14400F."
  )
  await dialog.getByRole("button", { name: "Cancel" }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByRole("button", { name: "Add to build" })).toBeFocused()

  await page.getByRole("button", { name: "Add to build" }).click()
  await dialog.getByRole("button", { name: "Replace" }).click()
  await expect(page.getByRole("status")).toContainText("Added to your build.")

  await page.goto("/builder")
  const cpu = slot(page, "CPU")
  await expect(
    cpu.getByRole("link", { name: "Intel Core i5-14400F", exact: true })
  ).toBeVisible()
  await expect(cpu.getByText("AMD Ryzen 5 7600")).toHaveCount(0)
  // No integrated graphics and no graphics card
  await expect(summary(page)).toContainText("Warnings")
})

test("parts that don't fit show as errors", async ({ page }) => {
  await addToBuild(page, RYZEN)
  await addToBuild(page, B760M)
  await page.goto("/builder")

  await expect(summary(page)).toContainText("Errors")
  await expect(summary(page)).toContainText(
    "The AMD Ryzen 5 7600 (AM5) doesn't fit the LGA1700 socket on the MSI PRO B760M-A WiFi DDR4."
  )
  await expect(
    slot(page, "CPU").getByText("Error", { exact: true })
  ).toBeVisible()
  await expect(
    slot(page, "Motherboard").getByText("Error", { exact: true })
  ).toBeVisible()
})

test("memory is raised from the product page and changed on the builder", async ({
  page,
}) => {
  await addToBuild(page, STRIX)
  await addToBuild(page, VENGEANCE)
  // The same kit again is one more
  await page.getByRole("button", { name: "Add to build" }).click()
  await page.goto("/builder")

  const memory = slot(page, "Memory")
  await expect(memory).toContainText("₱6,495.00 × 2")
  await expect(summary(page)).toContainText("No compatibility issues found.")

  await memory.getByRole("button", { name: /^Increase quantity of / }).click()
  await expect(memory).toContainText("₱6,495.00 × 3")
  await expect(summary(page)).toContainText("Errors")
  await expect(summary(page)).toContainText(
    "make 6 memory modules, but the ASUS ROG Strix B650-A Gaming WiFi has 4 memory slots."
  )

  // Removing a part needs no reload
  await memory.getByRole("button", { name: /^Remove / }).click()
  await expect(
    page.getByRole("link", { name: "Choose memory", exact: true })
  ).toBeVisible()
})

test("a saved part that no longer exists is removed, with a notice", async ({
  page,
}) => {
  await addToBuild(page, RYZEN)
  // A real CPU id, from the build Add to build saved, plus a graphics card
  // no product has
  await page.evaluate((key) => {
    const saved = JSON.parse(localStorage.getItem(key)!)
    saved.state.items.push({
      slot: "gpu",
      productId: "cm0000000000000000000000000",
      quantity: 1,
    })
    localStorage.setItem(key, JSON.stringify(saved))
  }, STORAGE_KEY)

  await page.goto("/builder")
  await expect(page.getByRole("status").first()).toContainText(
    "A part in your saved build is no longer available, so we removed it: Graphics Card."
  )
  await expect(
    slot(page, "CPU").getByRole("link", {
      name: "AMD Ryzen 5 7600",
      exact: true,
    })
  ).toBeVisible()

  // Removed for good, so the notice shows once
  await page.reload()
  await expect(
    slot(page, "CPU").getByRole("link", {
      name: "AMD Ryzen 5 7600",
      exact: true,
    })
  ).toBeVisible()
  await expect(page.getByText("no longer available")).toHaveCount(0)
})

test("parts that can't be bought now can't be added", async ({ page }) => {
  for (const path of [
    // Out of stock
    "/gpu/asus-rog-astral-geforce-rtx-5090-oc-edition-32gb",
    // Pre-order
    "/cpu/intel-core-ultra-7-265k",
  ]) {
    await page.goto(path)
    const button = page.getByRole("button", { name: "Add to build" })
    await expect(button).toBeDisabled()
    await expect(button).toHaveAccessibleDescription(
      "Only parts in stock can be added to a build."
    )
  }
})
