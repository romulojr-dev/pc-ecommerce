import type { SeedPart } from "../part-schema"

// nativeCpuGenerations = generations the board's launch BIOS supports. A
// newer generation on the same socket gets a "may need a BIOS update"
// warning. Prices are approximate PH retail, in centavos.
export const motherboards = [
  {
    sku: "90MB1BP0-M0AAY0",
    name: "ASUS ROG Strix B650-A Gaming WiFi",
    brand: "ASUS",
    price: 1499500,
    stock: 8,
    weightGrams: 1800,
    warrantyMonths: 36,
    sourceUrl:
      "https://rog.asus.com/motherboards/rog-strix/rog-strix-b650-a-gaming-wifi-model/spec/",
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
    price: 1550000,
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
    price: 849500,
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
] satisfies SeedPart<"motherboard">[]
