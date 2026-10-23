import type { SeedPart } from "../part-schema"

// Prices are approximate PH retail, in centavos.
export const psus = [
  {
    sku: "MPE-5501-ACAAB",
    name: "Cooler Master MWE 550 Bronze V2",
    brand: "Cooler Master",
    price: 299500,
    stock: 15,
    weightGrams: 2000,
    warrantyMonths: 60,
    sourceUrl:
      "https://www.coolermaster.com/catalog/power-supplies/mwe-series/mwe-550-bronze-v2/",
    specs: {
      formFactor: "ATX",
      wattageW: 550,
      efficiencyRating: "BRONZE",
      modularity: "NONE",
    },
  },
  {
    sku: "CP-9020263-NA",
    name: "Corsair RM850e (2023) 850W",
    brand: "Corsair",
    price: 749500,
    stock: 9,
    weightGrams: 2300,
    warrantyMonths: 84,
    sourceUrl:
      "https://www.corsair.com/us/en/p/psu/cp-9020263-na/rm850e-fully-modular-low-noise-atx-power-supply-cp-9020263-na",
    specs: {
      formFactor: "ATX",
      wattageW: 850,
      efficiencyRating: "GOLD",
      modularity: "FULL",
    },
  },
  {
    sku: "CP-9020186-NA",
    name: "Corsair SF750 750W SFX",
    brand: "Corsair",
    price: 1099500,
    stock: 5, // at lowStockAt
    weightGrams: 1300,
    warrantyMonths: 84,
    sourceUrl:
      "https://www.corsair.com/us/en/p/psu/cp-9020186-na/sf-series-sf750-750-watt-80-plus-platinum-certified-high-performance-sfx-psu-cp-9020186-na",
    specs: {
      formFactor: "SFX",
      wattageW: 750,
      efficiencyRating: "PLATINUM",
      modularity: "FULL",
    },
  },
] satisfies SeedPart<"psu">[]
