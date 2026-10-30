// The 17 independent cities outside NCR (PSGC gives them no province) and the
// province each one lies in (docs/specs/028-shipping-data-and-fee-rules,
// Rules › Independent cities, D19). Hand-made, because PSGC doesn't say. Keys
// are city codes, values province codes of the 2026Q3 publication. The
// dataset test fails when a city is missing here, or a code isn't in the
// dataset, or the province is in another region than the city.
// Pure.
export const independentCityProvinces: Readonly<Record<string, string>> = {
  "1430300000": "1401100000", // City of Baguio → Benguet
  "0330100000": "0305400000", // City of Angeles → Pampanga
  "0331400000": "0307100000", // City of Olongapo → Zambales
  "0431200000": "0405600000", // City of Lucena → Quezon
  "1731500000": "1705300000", // City of Puerto Princesa → Palawan
  "0631000000": "0603000000", // City of Iloilo → Iloilo
  "1830200000": "1804500000", // City of Bacolod → Negros Occidental
  "0730600000": "0702200000", // City of Cebu → Cebu
  "0731100000": "0702200000", // City of Lapu-Lapu → Cebu
  "0731300000": "0702200000", // City of Mandaue → Cebu
  "0831600000": "0803700000", // City of Tacloban → Leyte
  "0931700000": "0907300000", // City of Zamboanga → Zamboanga del Sur
  "1030500000": "1004300000", // City of Cagayan De Oro → Misamis Oriental
  "1030900000": "1003500000", // City of Iligan → Lanao del Norte
  "1130700000": "1102400000", // City of Davao → Davao del Sur
  "1230800000": "1206300000", // City of General Santos → South Cotabato
  "1630400000": "1600200000", // City of Butuan → Agusan del Norte
}
