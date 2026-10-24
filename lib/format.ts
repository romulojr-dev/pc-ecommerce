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
