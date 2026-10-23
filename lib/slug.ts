// Turns a name into a URL slug: "WD_BLACK SN850X 2 TB" -> "wd-black-sn850x-2-tb"
export function slugify(text: string): string {
  return (
    text
      // Split accented letters into letter + accent mark, then drop the marks
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      // Any run of characters that isn't a-z or 0-9 becomes one hyphen
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
  )
}
