const peso = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
})

// Integer centavos as pesos: 1149500 -> "₱11,495.00". Negative amounts
// (discounts) get a minus sign: -50000 -> "-₱500.00".
export function formatPeso(centavos: number): string {
  // Prices are integer centavos, so a fraction here is a bug upstream
  if (!Number.isInteger(centavos)) {
    throw new RangeError(`formatPeso expects integer centavos, got ${centavos}`)
  }
  return peso.format(centavos / 100)
}

// The sale's discount in whole percent, rounded down so it never claims more
// than the real discount: ₱11,495 -> ₱9,999 is 13.01 %, so 13. Under 1 % is 0.
export function discountPercent(price: number, salePrice: number): number {
  // Multiplied first, so whole results like 50 % aren't lost to float error
  return Math.floor(((price - salePrice) * 100) / price)
}

// Whole years as years, otherwise months: 36 -> "3-year warranty"
export function formatWarranty(months: number): string {
  if (months === 0) return "No manufacturer warranty"
  if (months % 12 === 0) return `${months / 12}-year warranty`
  return `${months}-month warranty`
}

// A calendar day is stored as UTC midnight, so it is formatted in UTC
const longDate = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "long",
  timeZone: "UTC",
})

// "2027-01-15" -> "January 15, 2027", whatever the machine's time zone
export function formatDate(isoDate: string): string {
  return longDate.format(new Date(isoDate))
}
