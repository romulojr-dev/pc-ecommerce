import type { SeedPart } from "../part-schema"

// capacityGb is decimal (1 TB = 1000). Prices are approximate PH retail, in
// centavos.
export const storage = [
  {
    sku: "MZ-V9P1T0BW",
    name: "Samsung 990 PRO 1TB NVMe SSD",
    brand: "Samsung",
    price: 699500,
    stock: 30,
    weightGrams: 60,
    warrantyMonths: 60,
    sourceUrl:
      "https://www.samsung.com/us/computing/memory-storage/solid-state-drives/990-pro-pcie-4-0-nvme-ssd-1tb-mz-v9p1t0b-am/",
    specs: { interface: "NVME", formFactor: "M2_2280", capacityGb: 1000 },
  },
  {
    sku: "WDS200T2X0E",
    name: "WD_BLACK SN850X 2TB NVMe SSD",
    brand: "Western Digital",
    price: 1199500,
    stock: 12,
    weightGrams: 60,
    warrantyMonths: 60,
    sourceUrl:
      "https://www.westerndigital.com/products/internal-drives/wd-black-sn850x-nvme-ssd?sku=WDS200T2X0E",
    specs: { interface: "NVME", formFactor: "M2_2280", capacityGb: 2000 },
  },
  {
    sku: "CT1000MX500SSD1",
    name: 'Crucial MX500 1TB 2.5" SATA SSD',
    brand: "Crucial",
    price: 449500,
    stock: 18,
    weightGrams: 100,
    warrantyMonths: 60,
    sourceUrl: "https://www.crucial.com/ssd/mx500/ct1000mx500ssd1",
    specs: { interface: "SATA", formFactor: "DRIVE_2_5", capacityGb: 1000 },
  },
] satisfies SeedPart<"storage">[]
