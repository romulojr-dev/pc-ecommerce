import { placeholderUrl } from "@/lib/placeholders"

import type { SeedPart } from "../part-schema"

// Prices are sample PH retail prices, in centavos. Tiers: budget under
// ₱4,000, mid ₱4,000–₱8,999, high ₱9,000+.
export const psus = [
  {
    sku: "MPE-5501-ACAAB",
    name: "Cooler Master MWE 550 Bronze V2",
    brand: "Cooler Master",
    price: 299500, // budget
    stock: 15,
    weightGrams: 2000,
    warrantyMonths: 60,
    boxContents: [
      "Power supply",
      "AC power cord",
      "Mounting screws",
      "User manual",
    ],
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
    featured: true,
    brand: "Corsair",
    price: 749500, // mid
    stock: 9,
    weightGrams: 2300,
    warrantyMonths: 84,
    boxContents: [
      "Power supply",
      "Modular cables",
      "AC power cord",
      "Cable ties",
      "Mounting screws",
      "User manual",
    ],
    sourceUrl:
      "https://www.corsair.com/us/en/p/psu/cp-9020263-na/rm850e-fully-modular-low-noise-atx-power-supply-cp-9020263-na",
    // Several images, for the product gallery (spec 006)
    images: [{ url: placeholderUrl("psu") }, { url: placeholderUrl("box") }],
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
    price: 1099500, // high
    stock: 5, // at lowStockAt
    weightGrams: 1300,
    warrantyMonths: 84,
    boxContents: [
      "Power supply",
      "Modular cables",
      "AC power cord",
      "SFX to ATX bracket",
      "Mounting screws",
      "User manual",
    ],
    sourceUrl:
      "https://www.corsair.com/us/en/p/psu/cp-9020186-na/sf-series-sf750-750-watt-80-plus-platinum-certified-high-performance-sfx-psu-cp-9020186-na",
    specs: {
      formFactor: "SFX",
      wattageW: 750,
      efficiencyRating: "PLATINUM",
      modularity: "FULL",
    },
  },
  {
    sku: "MAG A650BN",
    name: "MSI MAG A650BN 650W",
    brand: "MSI",
    price: 329500, // budget
    stock: 20,
    weightGrams: 2000,
    warrantyMonths: 60,
    boxContents: [
      "Power supply",
      "AC power cord",
      "Mounting screws",
      "User manual",
    ],
    sourceUrl: "https://www.msi.com/Power-Supply/MAG-A650BN/Specification",
    specs: {
      formFactor: "ATX",
      wattageW: 650,
      efficiencyRating: "BRONZE",
      modularity: "NONE",
    },
  },
  {
    sku: "SSR-1000FX3",
    name: "Seasonic FOCUS GX-1000 ATX 3 1000W",
    brand: "Seasonic",
    price: 999500, // high
    stock: 7,
    weightGrams: 2500,
    warrantyMonths: 120,
    boxContents: [
      "Power supply",
      "Modular cables",
      "AC power cord",
      "Cable ties",
      "Mounting screws",
      "User manual",
    ],
    sourceUrl: "https://seasonic.com/atx3-focus-gx/",
    // Lets the RTX 5090 pass PSU wattage: (88 + 575) × 1.3 = 862 W
    specs: {
      formFactor: "ATX",
      wattageW: 1000,
      efficiencyRating: "GOLD",
      modularity: "FULL",
    },
  },
  {
    sku: "BN755",
    name: "be quiet! Pure Power 12 M 750W",
    brand: "be quiet!",
    price: 649500, // mid
    salePrice: 599500,
    stock: 11,
    weightGrams: 2200,
    warrantyMonths: 120,
    boxContents: [
      "Power supply",
      "Modular cables",
      "AC power cord",
      "Cable ties",
      "Mounting screws",
      "User manual",
    ],
    sourceUrl: "https://www.bequiet.com/en/powersupply/4068",
    specs: {
      formFactor: "ATX",
      wattageW: 750,
      efficiencyRating: "GOLD",
      modularity: "FULL",
    },
  },
  {
    sku: "SP850",
    name: "Lian Li SP850 850W SFX",
    brand: "Lian Li",
    price: 949500, // high
    stock: 4, // low stock
    weightGrams: 1400,
    warrantyMonths: 60,
    boxContents: [
      "Power supply",
      "Modular cables",
      "AC power cord",
      "SFX to ATX bracket",
      "Mounting screws",
      "User manual",
    ],
    sourceUrl: "https://lian-li.com/product/sp850/",
    specs: {
      formFactor: "SFX",
      wattageW: 850,
      efficiencyRating: "GOLD",
      modularity: "FULL",
    },
  },
  {
    sku: "CP-9020254-NA",
    name: "Corsair RM1200x SHIFT 1200W",
    brand: "Corsair",
    price: 1599500, // high
    stock: 8,
    weightGrams: 3000,
    warrantyMonths: 120,
    boxContents: [
      "Power supply",
      "Modular cables",
      "AC power cord",
      "Cable ties",
      "Mounting screws",
    ],
    sourceUrl:
      "https://www.corsair.com/us/en/p/psu/cp-9020254-na/rm1200x-shift-80-plus-gold-fully-modular-atx-power-supply-cp-9020254-na",
    // Lets the RTX 5090 pass PSU wattage with room to spare
    specs: {
      formFactor: "ATX",
      wattageW: 1200,
      efficiencyRating: "GOLD",
      modularity: "FULL",
    },
  },
  {
    sku: "CP-9020245-NA",
    name: "Corsair SF850L 850W SFX-L",
    brand: "Corsair",
    price: 1099500, // high
    stock: 0, // out of stock
    weightGrams: 2000,
    warrantyMonths: 84,
    boxContents: [
      "Power supply",
      "Modular cables",
      "AC power cord",
      "Cable ties",
    ],
    sourceUrl:
      "https://www.corsair.com/us/en/p/psu/cp-9020245-na/sf-l-series-sf850l-fully-modular-low-noise-sfx-power-supply-cp-9020245-na",
    specs: {
      formFactor: "SFX_L",
      wattageW: 850,
      efficiencyRating: "GOLD",
      modularity: "FULL",
    },
  },
  {
    sku: "MAG A750GL PCIE5",
    name: "MSI MAG A750GL PCIE5 750W",
    brand: "MSI",
    price: 549500, // mid
    salePrice: 499500,
    stock: 18,
    weightGrams: 2900,
    warrantyMonths: 60,
    boxContents: [
      "Power supply",
      "Modular cables",
      "AC power cord",
      "Mounting screws",
      "User manual",
    ],
    sourceUrl:
      "https://www.msi.com/Power-Supply/MAG-A750GL-PCIE5/Specification",
    specs: {
      formFactor: "ATX",
      wattageW: 750,
      efficiencyRating: "GOLD",
      modularity: "FULL",
    },
  },
  {
    sku: "BN338",
    name: "be quiet! Straight Power 12 1000W",
    brand: "be quiet!",
    price: 1499500, // high
    stock: 6,
    weightGrams: 1850,
    warrantyMonths: 120,
    boxContents: [
      "Power supply",
      "Modular cables",
      "AC power cord",
      "Cable ties",
      "Mounting screws",
    ],
    sourceUrl: "https://www.bequiet.com/en/powersupply/4104",
    specs: {
      formFactor: "ATX",
      wattageW: 1000,
      efficiencyRating: "PLATINUM",
      modularity: "FULL",
    },
  },
  {
    sku: "SSR-750FM",
    name: "Seasonic FOCUS GM-750 750W",
    brand: "Seasonic",
    price: 649500, // mid
    stock: 13,
    weightGrams: 1700,
    warrantyMonths: 84,
    boxContents: [
      "Power supply",
      "Modular cable pack",
      "AC power cord",
      "Accessory bag",
      "User manual",
    ],
    sourceUrl:
      "https://seasonic.com/wp-content/uploads/2024/04/FOCUS-Gold-FM.pdf",
    specs: {
      formFactor: "ATX",
      wattageW: 750,
      efficiencyRating: "GOLD",
      modularity: "SEMI",
    },
  },
] satisfies SeedPart<"psu">[]
