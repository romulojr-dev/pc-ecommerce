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
  {
    sku: "MAG B550 TOMAHAWK",
    name: "MSI MAG B550 Tomahawk",
    brand: "MSI",
    price: 999500, // mid
    stock: 11,
    weightGrams: 1500,
    warrantyMonths: 36,
    boxContents: [
      "Motherboard",
      "SATA 6G cables",
      "M.2 screws",
      "Quick installation guide",
    ],
    sourceUrl:
      "https://www.msi.com/Motherboard/MAG-B550-TOMAHAWK/Specification",
    specs: {
      socket: "AM4",
      chipset: "B550",
      // Launched Jun 2020 for Ryzen 3000 (no zen-2 in the enum); Ryzen 5000
      // (zen-3) is on MSI's CPU support list
      nativeCpuGenerations: ["zen-3"],
      formFactor: "ATX",
      memoryType: "DDR4",
      memorySlots: 4,
      maxMemoryGb: 128,
      m2Slots: 2,
      hasWifi: false,
    },
  },
  {
    sku: "X570 AORUS ELITE",
    name: "Gigabyte X570 AORUS ELITE",
    brand: "Gigabyte",
    price: 1149500, // mid
    stock: 3, // low stock
    weightGrams: 1600,
    warrantyMonths: 36,
    boxContents: [
      "Motherboard",
      "SATA cables",
      "G Connector",
      "Quick installation guide",
    ],
    sourceUrl:
      "https://www.gigabyte.com/Motherboard/X570-AORUS-ELITE-rev-10/sp",
    specs: {
      socket: "AM4",
      chipset: "X570",
      // Launched Jul 2019 for Ryzen 3000 (no zen-2 in the enum); Ryzen 5000
      // (zen-3) arrived with BIOS F30, Sep 2020
      nativeCpuGenerations: ["zen-3"],
      formFactor: "ATX",
      memoryType: "DDR4",
      memorySlots: 4,
      maxMemoryGb: 128,
      m2Slots: 2,
      hasWifi: false, // the Wi-Fi version is the X570 AORUS ELITE WIFI
    },
  },
  {
    sku: "A620M-HDV/M.2",
    name: "ASRock A620M-HDV/M.2",
    brand: "ASRock",
    price: 499500, // budget
    salePrice: 449500,
    stock: 18,
    weightGrams: 900,
    warrantyMonths: 36,
    boxContents: [
      "Motherboard",
      "I/O shield",
      "SATA data cables",
      "M.2 screws",
      "User manual",
    ],
    sourceUrl: "https://www.asrock.com/mb/AMD/A620M-HDVM.2/index.asp",
    specs: {
      socket: "AM5",
      chipset: "A620",
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
    sku: "B650 AORUS ELITE AX",
    name: "Gigabyte B650 AORUS ELITE AX",
    brand: "Gigabyte",
    price: 1299500, // mid
    stock: 9,
    weightGrams: 1700,
    warrantyMonths: 36,
    boxContents: [
      "Motherboard",
      "SATA cables",
      "G Connector",
      "AORUS antenna",
      "Quick installation guide",
    ],
    sourceUrl:
      "https://www.gigabyte.com/Motherboard/B650-AORUS-ELITE-AX-rev-10-11/sp",
    specs: {
      socket: "AM5",
      chipset: "B650",
      // Launched Oct 2022; Ryzen 9000 (zen-5) arrived Aug 2024
      nativeCpuGenerations: ["zen-4"],
      formFactor: "ATX",
      memoryType: "DDR5",
      memorySlots: 4,
      maxMemoryGb: 256,
      m2Slots: 3,
      hasWifi: true,
    },
  },
  {
    sku: "TUF GAMING B850-PLUS WIFI",
    name: "ASUS TUF Gaming B850-PLUS WiFi",
    brand: "ASUS",
    price: 1549500, // high
    stock: 7,
    weightGrams: 1700,
    warrantyMonths: 36,
    boxContents: [
      "Motherboard",
      "2 x SATA 6Gb/s cables",
      "ASUS WiFi Q-Antenna",
      "TUF GAMING sticker",
      "2 x M.2 rubber packages",
      "Quick start guide",
    ],
    sourceUrl:
      "https://www.asus.com/motherboards-components/motherboards/tuf-gaming/tuf-gaming-b850-plus-wifi/techspec/",
    specs: {
      socket: "AM5",
      chipset: "B850",
      // Launched Jan 2025 with Ryzen 9000 and 7000 support
      nativeCpuGenerations: ["zen-4", "zen-5"],
      formFactor: "ATX",
      memoryType: "DDR5",
      memorySlots: 4,
      maxMemoryGb: 256,
      m2Slots: 3,
      hasWifi: true,
    },
  },
  {
    sku: "H610M-HDV/M.2 R2.0",
    name: "ASRock H610M-HDV/M.2 R2.0",
    brand: "ASRock",
    price: 399500, // budget
    stock: 22,
    weightGrams: 800,
    warrantyMonths: 36,
    boxContents: [
      "Motherboard",
      "I/O shield",
      "SATA data cable",
      "M.2 screw",
      "Quick installation guide",
    ],
    sourceUrl: "https://www.asrock.com/mb/Intel/H610M-HDVM.2%20R2.0/index.asp",
    specs: {
      socket: "LGA1700",
      chipset: "H610",
      // Launched Apr 2022, before 13th gen (raptor-lake, Oct 2022) and 14th
      nativeCpuGenerations: ["alder-lake"],
      formFactor: "MICRO_ATX",
      memoryType: "DDR4",
      memorySlots: 2,
      maxMemoryGb: 64,
      m2Slots: 1,
      hasWifi: false,
    },
  },
  {
    sku: "MAG B760 TOMAHAWK WIFI",
    name: "MSI MAG B760 Tomahawk WiFi",
    brand: "MSI",
    price: 1099500, // mid
    stock: 13,
    weightGrams: 1600,
    warrantyMonths: 36,
    boxContents: [
      "Motherboard",
      "SATA 6G cables",
      "Wi-Fi antenna",
      "M.2 screws",
      "Quick installation guide",
    ],
    sourceUrl:
      "https://www.msi.com/Motherboard/MAG-B760-TOMAHAWK-WIFI/Specification",
    specs: {
      socket: "LGA1700",
      chipset: "B760",
      // Launched Jan 2023, before 14th gen (raptor-lake-refresh, Oct 2023)
      nativeCpuGenerations: ["alder-lake", "raptor-lake"],
      formFactor: "ATX",
      memoryType: "DDR5",
      memorySlots: 4,
      maxMemoryGb: 256,
      m2Slots: 3, // plus a Key E slot for the Wi-Fi module
      hasWifi: true,
    },
  },
  {
    sku: "Z790 AORUS ELITE AX",
    name: "Gigabyte Z790 AORUS ELITE AX",
    brand: "Gigabyte",
    price: 1649500, // high
    stock: 6,
    weightGrams: 1900,
    warrantyMonths: 36,
    boxContents: [
      "Motherboard",
      "SATA cables",
      "G Connector",
      "AORUS antenna",
      "Quick installation guide",
    ],
    sourceUrl:
      "https://www.gigabyte.com/us/Motherboard/Z790-AORUS-ELITE-AX-rev-1x/sp",
    specs: {
      socket: "LGA1700",
      chipset: "Z790",
      // Launched Oct 2022 with 13th gen; 14th gen (raptor-lake-refresh) came
      // in Oct 2023
      nativeCpuGenerations: ["alder-lake", "raptor-lake"],
      formFactor: "ATX",
      memoryType: "DDR5",
      memorySlots: 4,
      maxMemoryGb: 256,
      m2Slots: 4,
      hasWifi: true,
    },
  },
  {
    sku: "MAG Z890 TOMAHAWK WIFI",
    name: "MSI MAG Z890 Tomahawk WiFi",
    brand: "MSI",
    price: 2099500, // high
    stock: 12,
    preorderShipsOn: "2027-02-12", // pre-order
    weightGrams: 1800,
    warrantyMonths: 36,
    boxContents: [
      "Motherboard",
      "SATA 6G cables",
      "Wi-Fi antenna",
      "M.2 screws",
      "Quick installation guide",
    ],
    sourceUrl:
      "https://www.msi.com/Motherboard/MAG-Z890-TOMAHAWK-WIFI/Specification",
    specs: {
      socket: "LGA1851",
      chipset: "Z890",
      nativeCpuGenerations: ["arrow-lake"], // the only LGA1851 generation
      formFactor: "ATX",
      memoryType: "DDR5",
      memorySlots: 4,
      maxMemoryGb: 256,
      m2Slots: 4, // plus a Key E slot for the Wi-Fi module
      hasWifi: true,
    },
  },
  {
    sku: "PRIME B860M-A WIFI",
    name: "ASUS PRIME B860M-A WiFi",
    brand: "ASUS",
    price: 899500, // budget
    stock: 15,
    weightGrams: 1300,
    warrantyMonths: 36,
    boxContents: [
      "Motherboard",
      "2 x SATA 6Gb/s cables",
      "ASUS WiFi Q-Antenna",
      "M.2 rubber package",
      "Screw package for M.2 SSDs",
      "Quick start guide",
    ],
    sourceUrl:
      "https://www.asus.com/us/motherboards-components/motherboards/prime/prime-b860m-a-wifi/techspec/",
    specs: {
      socket: "LGA1851",
      chipset: "B860",
      nativeCpuGenerations: ["arrow-lake"], // the only LGA1851 generation
      formFactor: "MICRO_ATX",
      memoryType: "DDR5",
      memorySlots: 4,
      maxMemoryGb: 256,
      m2Slots: 2,
      hasWifi: true,
    },
  },
] satisfies SeedPart<"motherboard">[]
