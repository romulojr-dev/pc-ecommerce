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
    featured: true,
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
  {
    sku: "MZ-V9S2T0BW",
    name: "Samsung 990 EVO Plus 2TB NVMe SSD",
    brand: "Samsung",
    price: 849500, // mid
    salePrice: 749500,
    stock: 20,
    weightGrams: 9,
    warrantyMonths: 60,
    boxContents: ["M.2 NVMe SSD"],
    sourceUrl:
      "https://www.samsung.com/au/memory-storage/nvme-ssd/990-evo-plus-2tb-nvme-pcie-gen-4-mz-v9s2t0bw/",
    specs: { interface: "NVME", formFactor: "M2_2280", capacityGb: 2000 },
  },
  {
    sku: "MZ-VAP2T0BW",
    name: "Samsung 9100 PRO 2TB PCIe Gen5 NVMe SSD",
    brand: "Samsung",
    price: 1599500, // high
    stock: 14, // pre-order
    preorderShipsOn: "2027-03-15",
    weightGrams: 9,
    warrantyMonths: 60,
    boxContents: ["M.2 NVMe SSD"],
    sourceUrl:
      "https://www.samsung.com/uk/memory-storage/nvme-ssd/9100-pro-2tb-nvme-pcie-gen-5-mz-vap2t0bw/",
    specs: { interface: "NVME", formFactor: "M2_2280", capacityGb: 2000 },
  },
  {
    sku: "WDS250G3B0E",
    name: "WD Blue SN580 250GB NVMe SSD",
    brand: "Western Digital",
    price: 169500, // budget
    stock: 40,
    weightGrams: 6,
    warrantyMonths: 60,
    boxContents: ["M.2 NVMe SSD"],
    // Product brief; the product pages render their specs by script
    sourceUrl:
      "https://documents.sandisk.com/content/dam/asset-library/en_us/assets/public/western-digital/product/internal-drives/wd-blue-ssd/product-brief-wd-blue-sn580-nvme-ssd.pdf",
    specs: { interface: "NVME", formFactor: "M2_2280", capacityGb: 250 },
  },
  {
    sku: "WDS200T4X0E",
    name: "WD_BLACK SN7100 2TB NVMe SSD",
    brand: "Western Digital",
    price: 999500, // mid
    stock: 14,
    weightGrams: 6,
    warrantyMonths: 60,
    boxContents: ["M.2 NVMe SSD"],
    // Data sheet; the product pages render their specs by script
    sourceUrl:
      "https://documents.sandisk.com/content/dam/asset-library/en_us/assets/public/sandisk/product/internal-drives/wd-black-ssd/data-sheet-wd-black-sn7100-nvme-ssd.pdf",
    specs: { interface: "NVME", formFactor: "M2_2280", capacityGb: 2000 },
  },
  {
    sku: "ZP1000GM3A013",
    name: "Seagate FireCuda 530 1TB NVMe SSD",
    brand: "Seagate",
    price: 749500, // mid
    stock: 9,
    weightGrams: 9,
    warrantyMonths: 60,
    boxContents: ["Seagate FireCuda 530 SSD"],
    sourceUrl:
      "https://www.seagate.com/content/dam/seagate/en/content-fragments/products/datasheets/firecuda-530-ssd/firecuda-530-ssd-DS2059-5-2310-AMER-en_US.pdf",
    specs: { interface: "NVME", formFactor: "M2_2280", capacityGb: 1000 },
  },
  {
    sku: "WDS100T3X0G",
    name: "WD_BLACK SN770M 1TB M.2 2230 NVMe SSD",
    brand: "Western Digital",
    price: 599500, // mid
    stock: 12,
    weightGrams: 3,
    warrantyMonths: 60,
    boxContents: ["M.2 2230 NVMe SSD"],
    // Data sheet; the product pages render their specs by script
    sourceUrl:
      "https://documents.sandisk.com/content/dam/asset-library/en_us/assets/public/sandisk/product/internal-drives/wd-black-ssd/data-sheet-wd-black-sn770m-nvme-ssd.pdf",
    specs: { interface: "NVME", formFactor: "M2_2230", capacityGb: 1000 },
  },
  {
    sku: "SKC3000S/512G",
    name: "Kingston KC3000 512GB NVMe SSD",
    brand: "Kingston",
    price: 329500, // budget
    stock: 3, // low stock
    weightGrams: 7,
    warrantyMonths: 60,
    boxContents: ["M.2 NVMe SSD"],
    sourceUrl: "https://www.kingston.com/datasheets/KC3000_us.pdf",
    specs: { interface: "NVME", formFactor: "M2_2280", capacityGb: 512 },
  },
  {
    sku: "SNV3S/4000G",
    name: "Kingston NV3 4TB NVMe SSD",
    brand: "Kingston",
    price: 1399500, // high
    stock: 10,
    weightGrams: 7,
    warrantyMonths: 60,
    boxContents: ["M.2 NVMe SSD"],
    sourceUrl: "https://www.kingston.com/datasheets/SNV3S_us.pdf",
    specs: { interface: "NVME", formFactor: "M2_2280", capacityGb: 4000 },
  },
  {
    sku: "SA400S37/480G",
    name: 'Kingston A400 480GB 2.5" SATA SSD',
    brand: "Kingston",
    price: 219500, // budget
    stock: 28,
    weightGrams: 41,
    warrantyMonths: 36,
    boxContents: ['2.5" SATA SSD'],
    sourceUrl: "https://www.kingston.com/datasheets/SA400S37_us.pdf",
    specs: { interface: "SATA", formFactor: "DRIVE_2_5", capacityGb: 480 },
  },
  {
    sku: "WDS100T5B0A",
    name: 'WD Blue SA510 1TB 2.5" SATA SSD',
    brand: "Western Digital",
    price: 349500, // budget
    stock: 22,
    weightGrams: 34,
    warrantyMonths: 60,
    boxContents: ['2.5" SATA SSD'],
    // Data sheet; the product pages render their specs by script
    sourceUrl:
      "https://documents.sandisk.com/content/dam/asset-library/en_us/assets/public/sandisk/product/internal-drives/wd-blue-ssd/data-sheet-wd-blue-sa510-sata-ssd.pdf",
    specs: { interface: "SATA", formFactor: "DRIVE_2_5", capacityGb: 1000 },
  },
  {
    sku: "ST4000DM004",
    name: 'Seagate BarraCuda 4TB 3.5" HDD',
    brand: "Seagate",
    price: 649500, // mid
    stock: 16,
    weightGrams: 490,
    warrantyMonths: 24,
    boxContents: ['3.5" SATA hard drive'],
    // Product manual; the product pages render their specs by script
    sourceUrl:
      "https://www.seagate.com/www-content/product-content/barracuda-fam/barracuda-new/en-us/docs/100805918n.pdf",
    specs: { interface: "SATA", formFactor: "DRIVE_3_5", capacityGb: 4000 },
  },
  {
    sku: "ST8000VN004",
    name: 'Seagate IronWolf 8TB 3.5" NAS HDD',
    brand: "Seagate",
    price: 1299500, // high
    stock: 0, // out of stock
    weightGrams: 716, // maximum
    warrantyMonths: 36,
    boxContents: ['3.5" SATA hard drive'],
    // Product manual; the product pages render their specs by script
    sourceUrl:
      "https://www.seagate.com/files/www-content/product-content/ironwolf/en-us/docs/100844482f.pdf",
    specs: { interface: "SATA", formFactor: "DRIVE_3_5", capacityGb: 8000 },
  },
  {
    sku: "WD10EZEX",
    name: 'WD Blue 1TB 3.5" HDD',
    brand: "Western Digital",
    price: 249500, // budget
    stock: 26,
    weightGrams: 450,
    warrantyMonths: 24,
    boxContents: ['3.5" SATA hard drive'],
    sourceUrl:
      "https://www.westerndigital.com/products/internal-drives/wd-blue-desktop-sata-hdd?sku=WD10EZEX",
    specs: { interface: "SATA", formFactor: "DRIVE_3_5", capacityGb: 1000 },
  },
] satisfies SeedPart<"storage">[]
