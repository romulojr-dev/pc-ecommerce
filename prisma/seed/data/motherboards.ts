import { placeholderUrl } from "@/lib/placeholders"

import type { SeedPart } from "../part-schema"

// nativeCpuGenerations = generations the board's launch BIOS supports. A
// newer generation on the same socket gets a "may need a BIOS update"
// warning. Prices are sample PH retail prices, in centavos. Tiers: budget
// under ₱9,000, mid ₱9,000–₱14,999, high ₱15,000+.
export const motherboards = [
  {
    sku: "90MB1BP0-M0AAY0",
    name: "ASUS ROG Strix B650-A Gaming WiFi",
    brand: "ASUS",
    price: 1499500, // mid
    stock: 8,
    weightGrams: 1800,
    warrantyMonths: 36,
    sourceUrl:
      "https://rog.asus.com/motherboards/rog-strix/rog-strix-b650-a-gaming-wifi-model/spec/",
    // Several images, for the product gallery (spec 006)
    images: [
      { url: placeholderUrl("motherboard") },
      { url: placeholderUrl("box") },
    ],
    specs: {
      socket: "AM5",
      chipset: "B650",
      // Launched Oct 2022; Ryzen 9000 (zen-5) arrived Aug 2024
      nativeCpuGenerations: ["zen-4"],
      formFactor: "ATX",
      memoryType: "DDR5",
      memorySlots: 4,
      maxMemoryGb: 192,
      m2Slots: 3,
      hasWifi: true,
    },
  },
  {
    sku: "B650I LIGHTNING WIFI",
    name: "ASRock B650I Lightning WiFi",
    brand: "ASRock",
    price: 1550000, // high
    stock: 3,
    weightGrams: 1200,
    warrantyMonths: 36,
    sourceUrl:
      "https://pg.asrock.com/mb/AMD/B650I%20Lightning%20WiFi/Specification.asp",
    specs: {
      socket: "AM5",
      chipset: "B650",
      nativeCpuGenerations: ["zen-4"],
      formFactor: "MINI_ITX",
      memoryType: "DDR5",
      memorySlots: 2,
      maxMemoryGb: 128,
      m2Slots: 2, // PCIe 5.0 front + PCIe 4.0 back
      hasWifi: true,
    },
  },
  {
    sku: "PRO B760M-A WIFI DDR4",
    name: "MSI PRO B760M-A WiFi DDR4",
    brand: "MSI",
    price: 849500, // budget
    stock: 10,
    weightGrams: 1500,
    warrantyMonths: 36,
    sourceUrl:
      "https://www.msi.com/Motherboard/PRO-B760M-A-WIFI-DDR4/Specification",
    specs: {
      socket: "LGA1700",
      chipset: "B760",
      // Launched Jan 2023, before 14th gen (raptor-lake-refresh, Oct 2023)
      nativeCpuGenerations: ["alder-lake", "raptor-lake"],
      formFactor: "MICRO_ATX",
      memoryType: "DDR4",
      memorySlots: 4,
      maxMemoryGb: 128,
      m2Slots: 2,
      hasWifi: true,
    },
  },
  {
    sku: "TUF GAMING B550-PLUS WIFI II",
    name: "ASUS TUF Gaming B550-PLUS WiFi II",
    brand: "ASUS",
    price: 949500, // mid
    salePrice: 849500,
    stock: 7,
    weightGrams: 1600,
    warrantyMonths: 36,
    sourceUrl:
      "https://www.asus.com/motherboards-components/motherboards/tuf-gaming/tuf-gaming-b550-plus-wifi-ii/techspec/",
    specs: {
      socket: "AM4",
      chipset: "B550",
      // Ryzen 5000 validated since BIOS 0303, the oldest in the support list
      nativeCpuGenerations: ["zen-3"],
      formFactor: "ATX",
      memoryType: "DDR4",
      memorySlots: 4,
      maxMemoryGb: 128,
      m2Slots: 2,
      hasWifi: true,
    },
  },
  {
    sku: "B650M-HDV/M.2",
    name: "ASRock B650M-HDV/M.2",
    brand: "ASRock",
    price: 649500, // budget
    stock: 14,
    weightGrams: 1100,
    warrantyMonths: 36,
    sourceUrl: "https://www.asrock.com/mb/AMD/B650M-HDVM.2/index.asp",
    specs: {
      socket: "AM5",
      chipset: "B650",
      // Launch BIOS supports Ryzen 7000 only
      nativeCpuGenerations: ["zen-4"],
      formFactor: "MICRO_ATX",
      memoryType: "DDR5",
      memorySlots: 2,
      maxMemoryGb: 128,
      m2Slots: 2, // plus a Key E slot for an optional Wi-Fi module
      hasWifi: false, // Wi-Fi module not included
    },
  },
  {
    sku: "PRIME B760M-A WIFI",
    name: "ASUS PRIME B760M-A WiFi",
    brand: "ASUS",
    price: 829500, // budget
    stock: 10,
    weightGrams: 1300,
    warrantyMonths: 36,
    sourceUrl:
      "https://www.asus.com/motherboards-components/motherboards/prime/prime-b760m-a-wifi/",
    specs: {
      socket: "LGA1700",
      chipset: "B760",
      // Launch BIOS supports 12th and 13th gen only
      nativeCpuGenerations: ["alder-lake", "raptor-lake"],
      formFactor: "MICRO_ATX",
      memoryType: "DDR5",
      memorySlots: 4,
      maxMemoryGb: 192,
      m2Slots: 2,
      hasWifi: true,
    },
  },
  {
    sku: "TUF GAMING B860-PLUS WIFI",
    name: "ASUS TUF Gaming B860-PLUS WiFi",
    brand: "ASUS",
    price: 1199500, // mid
    stock: 4, // low stock
    weightGrams: 1700,
    warrantyMonths: 36,
    sourceUrl:
      "https://www.asus.com/motherboards-components/motherboards/tuf-gaming/tuf-gaming-b860-plus-wifi/",
    specs: {
      socket: "LGA1851",
      chipset: "B860",
      nativeCpuGenerations: ["arrow-lake"], // the only LGA1851 generation
      formFactor: "ATX",
      memoryType: "DDR5",
      memorySlots: 4,
      maxMemoryGb: 256,
      m2Slots: 3,
      hasWifi: true,
    },
  },
  {
    sku: "X870E AORUS ELITE WIFI7",
    name: "Gigabyte X870E AORUS ELITE WiFi7",
    brand: "Gigabyte",
    price: 2299500, // high
    stock: 0, // out of stock
    weightGrams: 2000,
    warrantyMonths: 36,
    sourceUrl:
      "https://www.gigabyte.com/Motherboard/X870E-AORUS-ELITE-WIFI7-rev-10/sp",
    specs: {
      socket: "AM5",
      chipset: "X870E",
      // Launched Sep 2024 alongside Ryzen 9000
      nativeCpuGenerations: ["zen-4", "zen-5"],
      formFactor: "ATX",
      memoryType: "DDR5",
      memorySlots: 4,
      maxMemoryGb: 256,
      m2Slots: 4,
      hasWifi: true,
    },
  },
] satisfies SeedPart<"motherboard">[]
