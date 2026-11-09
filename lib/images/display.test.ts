import { describe, expect, test } from "vitest"

import { displayImages, mainImageOf, placeholderImage } from "./display"

const photo = (n: number) => ({
  url: `https://abc.public.blob.vercel-storage.com/products/p${n}.webp`,
  alt: `Photo ${n}`,
})

describe("displayImages", () => {
  test("E30: no photos shows the category placeholder with the name as alt", () => {
    expect(displayImages([], "cpu", "Intel Core i5-14400F")).toEqual({
      images: [
        { url: "/images/placeholders/cpu.svg", alt: "Intel Core i5-14400F" },
      ],
      placeholder: true,
    })
  })

  test("every builder category has a placeholder", () => {
    for (const slug of [
      "cpu",
      "motherboard",
      "memory",
      "storage",
      "gpu",
      "case",
      "psu",
      "cpu-cooler",
    ]) {
      expect(placeholderImage(slug, "x")?.url).toBe(
        `/images/placeholders/${slug}.svg`
      )
    }
  })

  test("real photos keep their order and hide the placeholder", () => {
    expect(displayImages([photo(2), photo(1)], "cpu", "Ryzen")).toEqual({
      images: [photo(2), photo(1)],
      placeholder: false,
    })
  })

  test("a category without artwork has no placeholder image", () => {
    expect(displayImages([], "monitors", "A monitor")).toEqual({
      images: [],
      placeholder: true,
    })
  })
})

describe("mainImageOf", () => {
  test("the first photo", () => {
    expect(mainImageOf([photo(1), photo(2)], "cpu", "Ryzen")).toEqual(photo(1))
  })

  test("E26: the placeholder once the last photo is gone", () => {
    expect(mainImageOf([], "cpu", "AMD Ryzen 5 7600")).toEqual({
      url: "/images/placeholders/cpu.svg",
      alt: "AMD Ryzen 5 7600",
    })
  })

  test("null where no category artwork exists", () => {
    expect(mainImageOf([], "monitors", "A monitor")).toBeNull()
  })
})
