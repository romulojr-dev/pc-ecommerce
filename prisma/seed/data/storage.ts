import type { SeedPart } from "../part-schema"

// capacityGb is decimal (1 TB = 1000). Prices are sample PH retail prices,
// in centavos. Tiers: budget under ₱4,000, mid ₱4,000–₱9,999, high
// ₱10,000+.
export const storage = [
  {
    sku: "MZ-V9P1T0BW",
    name: "Samsung 990 PRO 1TB NVMe SSD",
    brand: "Samsung",
    price: 699500, // mid
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
    price: 1199500, // high
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
    price: 449500, // mid
    stock: 18,
    weightGrams: 100,
    warrantyMonths: 60,
    sourceUrl: "https://www.crucial.com/ssd/mx500/ct1000mx500ssd1",
    specs: { interface: "SATA", formFactor: "DRIVE_2_5", capacityGb: 1000 },
  },
  {
    sku: "SNV3S/1000G",
    name: "Kingston NV3 1TB NVMe SSD",
    brand: "Kingston",
    price: 399500, // budget
    salePrice: 359500,
    stock: 35,
    weightGrams: 50,
    warrantyMonths: 36,
    sourceUrl:
      "https://www.kingston.com/en/ssd/nv3-nvme-pcie-ssd?partnum=snv3s%2F1000g",
    specs: { interface: "NVME", formFactor: "M2_2280", capacityGb: 1000 },
  },
  {
    sku: "CT2000T705SSD3",
    name: "Crucial T705 2TB PCIe Gen5 NVMe SSD",
    brand: "Crucial",
    price: 1799500, // high
    stock: 2, // low stock
    weightGrams: 60, // no heatsink
    warrantyMonths: 60,
    sourceUrl: "https://www.crucial.com/ssd/t705/ct2000t705ssd3",
    specs: { interface: "NVME", formFactor: "M2_2280", capacityGb: 2000 },
  },
  {
    sku: "MZ-77E500B/AM",
    name: 'Samsung 870 EVO 500GB 2.5" SATA SSD',
    brand: "Samsung",
    price: 349500, // budget
    stock: 9,
    weightGrams: 100,
    warrantyMonths: 60,
    sourceUrl:
      "https://www.samsung.com/us/memory-storage/sata-ssd/870-evo-sata-2-5-ssd-500gb-sku-mz-77e500b-am/",
    specs: { interface: "SATA", formFactor: "DRIVE_2_5", capacityGb: 500 },
  },
  {
    sku: "ST2000DM008",
    name: 'Seagate BarraCuda 2TB 3.5" HDD',
    brand: "Seagate",
    price: 379500, // budget
    stock: 13,
    weightGrams: 490,
    warrantyMonths: 24,
    // Product manual; the product pages render their specs by script
    sourceUrl:
      "https://www.seagate.com/files/www-content/product-content/barracuda-fam/barracuda-new/en-us/docs/100817550m.pdf",
    specs: { interface: "SATA", formFactor: "DRIVE_3_5", capacityGb: 2000 },
  },
] satisfies SeedPart<"storage">[]
