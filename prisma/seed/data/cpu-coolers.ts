import { placeholderUrl } from "@/lib/placeholders"

import type { SeedPart } from "../part-schema"

// heightMm (air coolers) is rounded up from the manufacturer's figure.
// Prices are sample PH retail prices, in centavos. Tiers: budget under
// ₱2,500, mid ₱2,500–₱6,499, high ₱6,500+.
export const cpuCoolers = [
  {
    sku: "PA120 SE",
    name: "Thermalright Peerless Assassin 120 SE",
    brand: "Thermalright",
    price: 229500, // budget
    stock: 20,
    weightGrams: 1300,
    warrantyMonths: 36,
    boxContents: [
      "CPU cooler with 2× 120 mm fans",
      "Intel and AMD mounting kit",
      "Thermal paste",
    ],
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
    price: 329500, // mid
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
    featured: true,
    brand: "Arctic",
    price: 599500, // mid
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
  {
    sku: "SE-224-XT ARGB V3",
    name: "ID-COOLING SE-224-XT ARGB V3",
    brand: "ID-COOLING",
    price: 149500, // budget
    stock: 25,
    weightGrams: 900,
    warrantyMonths: 24,
    sourceUrl:
      "https://www.idcooling.com/product/detail?id=278&name=SE-224-XT+ARGB+V3",
    specs: {
      type: "AIR",
      supportedSockets: ["AM4", "AM5", "LGA1700", "LGA1851"],
      heightMm: 153,
    },
  },
  {
    sku: "R-AK400-BKNNMN-G-1",
    name: "DeepCool AK400",
    brand: "DeepCool",
    price: 189500, // budget
    salePrice: 169500,
    stock: 18,
    weightGrams: 900,
    warrantyMonths: 36,
    sourceUrl:
      "https://uk.deepcool.com/products/Cooling/cpuaircoolers/AK400-Performance-CPU-Cooler-1851-1700-AM5/2024/15343.shtml",
    specs: {
      type: "AIR",
      supportedSockets: ["AM4", "AM5", "LGA1700", "LGA1851"],
      heightMm: 155,
    },
  },
  {
    sku: "NH-D15 G2",
    name: "Noctua NH-D15 G2",
    brand: "Noctua",
    price: 849500, // high
    stock: 5, // low stock
    weightGrams: 2200,
    warrantyMonths: 72,
    boxContents: [
      "CPU cooler with 2× 140 mm fans",
      "SecuFirm2+ mounting kit",
      "NT-H2 thermal paste",
      "Low-noise adapters",
      "Screwdriver",
      "Case badge",
    ],
    sourceUrl: "https://www.noctua.at/en/products/nh-d15-g2/specifications",
    // Several images, for the product gallery (spec 006)
    images: [
      { url: placeholderUrl("cpu-cooler") },
      { url: placeholderUrl("box") },
      { url: placeholderUrl("detail") },
    ],
    // 168 mm: too tall for the Q300L (157) and the AIR 100 (161)
    specs: {
      type: "AIR",
      supportedSockets: ["AM4", "AM5", "LGA1700", "LGA1851"],
      heightMm: 168,
    },
  },
  {
    sku: "RL-KN240-B1",
    name: "NZXT Kraken 240",
    brand: "NZXT",
    price: 699500, // high
    stock: 9,
    weightGrams: 1800,
    warrantyMonths: 72,
    sourceUrl: "https://nzxt.com/ja-intl/products/kraken-240",
    specs: {
      type: "AIO",
      supportedSockets: ["AM4", "AM5", "LGA1700", "LGA1851"],
      radiatorSizeMm: 240,
    },
  },
  {
    sku: "R-AK620-BKNNMT-G",
    name: "DeepCool AK620",
    brand: "DeepCool",
    price: 349500, // mid
    stock: 15,
    weightGrams: 1456,
    warrantyMonths: 60,
    boxContents: [
      "CPU cooler with 2× 120 mm PWM fans",
      "Intel and AMD mounting kit",
      "Thermal paste",
    ],
    sourceUrl:
      "https://global.deepcool.com/products/Cooling/cpuaircoolers/AK620-High-Performance-CPU-Cooler/2021/13067.shtml",
    specs: {
      type: "AIR",
      // LGA1851 is on DeepCool's AK620 Series manual, not on this product page
      supportedSockets: ["AM4", "AM5", "LGA1700", "LGA1851"],
      heightMm: 157,
    },
  },
  {
    sku: "PS120SE",
    name: "Thermalright Phantom Spirit 120 SE",
    brand: "Thermalright",
    price: 279500, // mid
    salePrice: 249500,
    stock: 17,
    weightGrams: 1035, // heatsink 765 g plus 2 fans at 135 g
    warrantyMonths: 36,
    boxContents: [
      "CPU cooler with 2× 120 mm fans",
      "Intel and AMD mounting kit",
      "Thermal paste",
    ],
    sourceUrl: "https://www.thermalright.com/product/phantom-spirit-120-se/",
    specs: {
      type: "AIR",
      supportedSockets: ["AM4", "AM5", "LGA1700", "LGA1851"],
      heightMm: 154,
    },
  },
  {
    sku: "NH-U12A",
    name: "Noctua NH-U12A",
    brand: "Noctua",
    price: 749500, // high
    stock: 10,
    weightGrams: 1800, // with packaging
    warrantyMonths: 72,
    boxContents: [
      "CPU cooler with 2× 120 mm NF-A12x25 PWM fans",
      "SecuFirm2 mounting kit",
      "NT-H1 thermal paste",
      "Low-noise adapters",
      "PWM splitter cable",
      "Case badge",
    ],
    sourceUrl:
      "https://cdn.noctua.at/media/noctua_nh_u12a_infosheet_en_web.pdf",
    specs: {
      type: "AIR",
      supportedSockets: ["AM4", "AM5", "LGA1700", "LGA1851"],
      heightMm: 158,
    },
  },
  {
    sku: "ACFRE00121A",
    name: "Arctic Freezer 36",
    brand: "Arctic",
    price: 229500, // budget
    stock: 22,
    weightGrams: 1230, // with packaging
    warrantyMonths: 72,
    boxContents: [
      "CPU cooler with 2× 120 mm P12 PWM PST fans",
      "Intel and AMD mounting kit",
      "MX-7 thermal paste",
      "Fan splitter cable",
    ],
    sourceUrl: "https://www.arctic.de/us/Freezer-36/ACFRE00121A",
    specs: {
      type: "AIR",
      supportedSockets: ["AM4", "AM5", "LGA1700", "LGA1851"],
      heightMm: 159,
    },
  },
  {
    sku: "ACFRE00135A",
    name: "Arctic Liquid Freezer III 280",
    brand: "Arctic",
    price: 549500, // mid
    stock: 11,
    weightGrams: 2233, // with packaging
    warrantyMonths: 72,
    boxContents: [
      "Pump block with 280 mm radiator",
      "2× 140 mm P14 PWM fans",
      "60 mm VRM fan",
      "Intel and AMD mounting kit",
      "MX-6 thermal paste",
      "Splitter cable",
    ],
    sourceUrl: "https://www.arctic.de/us/Liquid-Freezer-III-280/ACFRE00135A",
    specs: {
      type: "AIO",
      supportedSockets: ["AM4", "AM5", "LGA1700", "LGA1851"],
      radiatorSizeMm: 280,
    },
  },
] satisfies SeedPart<"cpu-cooler">[]
