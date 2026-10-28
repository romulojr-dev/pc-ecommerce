import type { Page } from "@playwright/test"

import { expect, test } from "./test"

// The Builder epic's journey and the slot picker (docs/specs/021-slot-
// picker, E13, E40–E44): pick a CPU → the motherboard slot hides boards with
// another socket → "Show all" shows the reason → pick a fitting board →
// status OK. Needs a seeded database; every test starts with an empty
// saved build (a fresh browser context).

const summary = (page: Page) =>
  page.getByRole("complementary", { name: "Your build" })

const slot = (page: Page, name: string) =>
  page.getByRole("listitem").filter({
    has: page.getByRole("heading", { name, exact: true }),
  })

const picker = (page: Page, name: string) =>
  page.getByRole("dialog", { name, exact: true })

// Opens the picker with `button`, adds `part` from it with "Add to build"
async function pickPart(
  page: Page,
  button: string,
  dialog: string,
  part: string
) {
  await page.getByRole("button", { name: button, exact: true }).click()
  await picker(page, dialog)
    .getByRole("button", { name: `Add ${part} to your build`, exact: true })
    .click()
  await expect(picker(page, dialog)).toBeHidden()
}

test("the epic: pick a CPU, see the boards that fit, then a reason, then OK", async ({
  page,
}) => {
  await page.goto("/builder")

  // E40: focus moves into the dialog, Escape closes it, focus comes back
  const chooseCpu = page.getByRole("button", {
    name: "Choose a CPU",
    exact: true,
  })
  await chooseCpu.click()
  const cpus = picker(page, "Choose a CPU")
  await expect(cpus).toBeVisible()
  await expect(cpus).toContainText("fit your build and are in stock.")
  await expect(cpus.locator(":focus")).toHaveCount(1)
  await page.keyboard.press("Escape")
  await expect(cpus).toBeHidden()
  await expect(chooseCpu).toBeFocused()

  // E41: the Ryzen 5 7600 (AM5), then only boards that take it
  await pickPart(page, "Choose a CPU", "Choose a CPU", "AMD Ryzen 5 7600")
  await expect(
    slot(page, "CPU").getByRole("button", { name: "Change CPU" })
  ).toBeFocused()

  await page
    .getByRole("button", { name: "Choose a motherboard", exact: true })
    .click()
  const boards = picker(page, "Choose a motherboard")
  await expect(boards).toContainText(
    "6 of 18 motherboards fit your build and are in stock."
  )
  await expect(
    boards.getByRole("heading", { name: "ASUS ROG Strix B650-A Gaming WiFi" })
  ).toBeVisible()
  await expect(
    boards.getByRole("heading", { name: "MSI PRO B760M-A WiFi DDR4" })
  ).toHaveCount(0)

  // E42: "Show all" lists it, greyed, with the reason, and makes no request
  const requests: string[] = []
  page.on("request", (request) => {
    if (request.url().includes("/api/builder/")) requests.push(request.url())
  })
  await boards.getByText("Show all").click()
  await expect(boards).toContainText("Showing all 18 motherboards.")
  await expect(
    boards.getByRole("heading", { name: "MSI PRO B760M-A WiFi DDR4" })
  ).toBeVisible()
  await expect(boards).toContainText(
    "The AMD Ryzen 5 7600 (AM5) doesn't fit the LGA1700 socket on the MSI PRO B760M-A WiFi DDR4."
  )
  await boards.getByText("Show all").click()
  await expect(boards).toContainText("6 of 18 motherboards fit")
  expect(requests, "toggling Show all asks for nothing").toEqual([])

  // E43: Close puts focus back on the button that opened the picker
  await boards.getByRole("button", { name: "Close" }).click()
  await expect(boards).toBeHidden()
  await expect(
    page.getByRole("button", { name: "Choose a motherboard", exact: true })
  ).toBeFocused()

  // E44: a fitting board; the picker closes, focus is on its Change button
  await pickPart(
    page,
    "Choose a motherboard",
    "Choose a motherboard",
    "ASUS ROG Strix B650-A Gaming WiFi"
  )
  await expect(
    slot(page, "Motherboard").getByRole("button", {
      name: "Change Motherboard",
    })
  ).toBeFocused()
  await expect(summary(page)).toContainText("OK")
  await expect(summary(page)).toContainText("No compatibility issues found.")
})

test("a part that doesn't fit is added only after a confirmation (E13)", async ({
  page,
}) => {
  await page.goto("/builder")
  await pickPart(page, "Choose a CPU", "Choose a CPU", "AMD Ryzen 5 7600")

  await page
    .getByRole("button", { name: "Choose a motherboard", exact: true })
    .click()
  const boards = picker(page, "Choose a motherboard")
  await boards.getByText("Show all").click()
  const addAnyway = boards.getByRole("button", {
    name: "Add MSI PRO B760M-A WiFi DDR4 to your build anyway",
  })
  await addAnyway.click()

  // Cancel changes nothing and keeps the picker open
  const confirm = page.getByRole("dialog", {
    name: "Add a part that doesn't fit?",
  })
  await expect(confirm).toContainText(
    "The AMD Ryzen 5 7600 (AM5) doesn't fit the LGA1700 socket on the MSI PRO B760M-A WiFi DDR4."
  )
  await confirm.getByRole("button", { name: "Cancel" }).click()
  await expect(confirm).toBeHidden()
  await expect(boards).toBeVisible()
  await expect(addAnyway).toBeFocused()

  await addAnyway.click()
  await confirm.getByRole("button", { name: "Add anyway" }).click()
  await expect(confirm).toBeHidden()
  await expect(boards).toBeHidden()
  await expect(
    slot(page, "Motherboard").getByRole("link", {
      name: "MSI PRO B760M-A WiFi DDR4",
    })
  ).toBeVisible()
  await expect(summary(page)).toContainText("Errors")
})

test("parts that can't be bought are greyed and can't be added (E14)", async ({
  page,
}) => {
  await page.goto("/builder")
  await page.getByRole("button", { name: "Choose a CPU", exact: true }).click()
  const cpus = picker(page, "Choose a CPU")

  // The out-of-stock and pre-order CPUs are hidden by default
  await expect(
    cpus.getByRole("heading", { name: "Intel Core Ultra 7 265K" })
  ).toHaveCount(0)

  await cpus.getByText("Show all").click()
  await expect(cpus).toContainText("Pre-order: ships February 1, 2027")
  const button = cpus.getByRole("button", {
    name: "Add Intel Core Ultra 7 265K to your build",
    exact: true,
  })
  await expect(button).toBeDisabled()
  await expect(button).toHaveAccessibleDescription(
    "Only parts in stock can be added to a build."
  )
})

test("changing a part replaces it at once, marking the current one (E11, E11a)", async ({
  page,
}) => {
  await page.goto("/builder")
  await pickPart(page, "Choose a CPU", "Choose a CPU", "AMD Ryzen 5 7600")

  await slot(page, "CPU").getByRole("button", { name: "Change CPU" }).click()
  const cpus = picker(page, "Change the CPU")
  // The current part is marked and has no button
  await expect(cpus).toContainText("Current")
  await expect(
    cpus.getByRole("button", {
      name: "Add AMD Ryzen 5 7600 to your build",
      exact: true,
    })
  ).toHaveCount(0)

  // No "Replace?" dialog: the shopper chose Change
  await cpus
    .getByRole("button", {
      name: "Add AMD Ryzen 7 7700 to your build",
      exact: true,
    })
    .click()
  await expect(cpus).toBeHidden()
  await expect(
    slot(page, "CPU").getByRole("link", { name: "AMD Ryzen 7 7700" })
  ).toBeVisible()
  await expect(slot(page, "CPU").getByText("AMD Ryzen 5 7600")).toHaveCount(0)
})

test("a drive can be added, and another replaced in place (E17, E21)", async ({
  page,
}) => {
  await page.goto("/builder")
  await pickPart(
    page,
    "Choose storage",
    "Add a drive",
    "Samsung 990 PRO 1TB NVMe SSD"
  )
  await pickPart(
    page,
    "Add another drive",
    "Add a drive",
    'Crucial MX500 1TB 2.5" SATA SSD'
  )
  const storage = slot(page, "Storage")
  await expect(storage.getByRole("link")).toHaveText([
    "Samsung 990 PRO 1TB NVMe SSD",
    'Crucial MX500 1TB 2.5" SATA SSD',
  ])

  await storage
    .getByRole("button", { name: "Change Samsung 990 PRO 1TB NVMe SSD" })
    .click()
  const replace = picker(page, "Replace the Samsung 990 PRO 1TB NVMe SSD")
  await expect(replace).toContainText("Current")
  await replace
    .getByRole("button", {
      name: "Add WD_BLACK SN850X 2TB NVMe SSD to your build",
      exact: true,
    })
    .click()
  await expect(storage.getByRole("link")).toHaveText([
    "WD_BLACK SN850X 2TB NVMe SSD",
    'Crucial MX500 1TB 2.5" SATA SSD',
  ])
})
