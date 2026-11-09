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

// The Photos section of a product page and the list's filter (spec 049, §5)
export const IMAGE_UI = {
  heading: "Photos",
  empty: (category: string) =>
    `No photos yet. The store shows the ${category} placeholder until you add one.`,
  uploadLabel: "Add photos",
  hint: "JPEG, PNG or WebP, up to 4 MB each. Up to 8 photos per product.",
  progress: (n: number, total: number) => `Uploading ${n} of ${total}…`,
  added: (name: string) => `${name} added.`,
  refused: (name: string, reason: string) => `${name}: ${reason}`,
  room: (room: number) =>
    room === 0
      ? IMAGE_REASONS.full
      : `You can add ${room} more photo${room === 1 ? "" : "s"} to this product.`,
  done: "Photos added.",
  nextProduct: (name: string) => `Next product without photos: ${name}`,
  allDone: "Every product now has a photo.",
  mainBadge: "Main image",
  buttons: {
    moveUp: "Move up",
    moveDown: "Move down",
    makeMain: "Make main image",
    remove: "Remove",
    saveAlt: "Save alt text",
  },
  // Accessible names add the position
  moveUp: (n: number) => `Move photo ${n} up`,
  moveDown: (n: number) => `Move photo ${n} down`,
  makeMain: (n: number) => `Make photo ${n} the main image`,
  remove: (n: number) => `Remove photo ${n}`,
  altLabel: "Alt text",
  altHelp: "Describe the photo for shoppers who use a screen reader.",
  altEmpty: "Describe the photo for people who can't see it.",
  altTooLong: "Keep it under 200 characters.",
  altSaved: "Alt text saved.",
  removeTitle: "Remove this photo?",
  removeBody: "It is deleted from the store's storage and can't be restored.",
  removeLast: (category: string) =>
    `The store will show the ${category} placeholder again.`,
  removeConfirm: "Remove photo",
  cancel: "Cancel",
  removed: "Photo removed.",
  moved: (n: number) => `Photo moved to position ${n}.`,
  mainChanged: "Main image changed.",
  stale:
    "These photos changed since you opened the page. Reload to see the current ones.",
  reload: "Reload",
  failed: IMAGE_REASONS.failed,
  filterLabel: "Photos",
  filterAny: "Any",
  filterMissing: "No photos yet",
  thumbnailHeader: "Photo",
  noPhotoBadge: "No photo",
} as const
