// Words for the photo upload and management (docs/specs/049-product-images-
// upload, §5). The route's refusals are written to follow a file name:
// the screen shows "{filename}: {reason}", and the server never sees or echoes
// the owner's file name.

export const IMAGE_REASONS = {
  type: "Only JPEG, PNG and WebP photos can be uploaded.",
  tooLarge: "It is larger than 4 MB.",
  pixels: "It has too many pixels (the limit is 40 megapixels).",
  unreadable: "It couldn't be read as a photo.",
  full: "This product already has 8 photos. Remove one to add another.",
  notFound: "This product doesn't exist.",
  store: "The photo couldn't be stored. Try again.",
  failed: "Something went wrong. Try again.",
  target: "Unknown upload target.",
  length: "Length required.",
} as const

export type ImageReason = keyof typeof IMAGE_REASONS
