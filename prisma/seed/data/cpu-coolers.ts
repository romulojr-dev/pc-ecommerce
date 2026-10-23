import type { SeedPart } from "../part-schema"

// heightMm (air coolers) is rounded up from the manufacturer's figure.
// Prices are approximate PH retail, in centavos.
export const cpuCoolers = [
  {
    sku: "PA120 SE",
    name: "Thermalright Peerless Assassin 120 SE",
    brand: "Thermalright",
    price: 229500,
    stock: 20,
    weightGrams: 1300,
    warrantyMonths: 36,
    sourceUrl: "https://www.thermalright.com/product/peerless-assassin-120-se/",
    specs: {
      type: "AIR",
      supportedSockets: ["AM4", "AM5", "LGA1700", "LGA1851"],
      heightMm: 155,
    },
  },
  {
    sku: "NH-L9a-AM5",
    name: "Noctua NH-L9a-AM5 Low-Profile Cooler",
    brand: "Noctua",
    price: 329500,
    stock: 6,
    weightGrams: 450,
    warrantyMonths: 72,
    sourceUrl: "https://noctua.at/en/nh-l9a-am5/specification",
    specs: {
      type: "AIR",
      supportedSockets: ["AM5"],
      heightMm: 37,
    },
  },
  {
    sku: "ACFRE00136A",
    name: "Arctic Liquid Freezer III 360",
    brand: "Arctic",
    price: 599500,
    stock: 7,
    weightGrams: 2200,
    warrantyMonths: 72,
    sourceUrl: "https://www.arctic.de/en/Liquid-Freezer-III-360/ACFRE00136A",
    specs: {
      type: "AIO",
      supportedSockets: ["AM4", "AM5", "LGA1700", "LGA1851"],
      radiatorSizeMm: 360,
    },
  },
] satisfies SeedPart<"cpu-cooler">[]
