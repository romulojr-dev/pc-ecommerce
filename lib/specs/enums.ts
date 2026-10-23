import { z } from "zod"

// Shared enums for spec fields. Stored values are stable identifiers; the
// *_LABELS maps hold what the UI shows. Adding a value is a reviewed code
// change (ADR 0002).

export const SOCKETS = ["AM4", "AM5", "LGA1700", "LGA1851"] as const
export const socket = z.enum(SOCKETS)
export type Socket = z.infer<typeof socket>
export const SOCKET_LABELS: Record<Socket, string> = {
  AM4: "AM4",
  AM5: "AM5",
  LGA1700: "LGA1700",
  LGA1851: "LGA1851",
}

export const CPU_GENERATIONS = [
  "zen-3",
  "zen-4",
  "zen-5",
  "alder-lake",
  "raptor-lake",
  "raptor-lake-refresh",
  "arrow-lake",
] as const
export const cpuGeneration = z.enum(CPU_GENERATIONS)
export type CpuGeneration = z.infer<typeof cpuGeneration>
export const CPU_GENERATION_LABELS: Record<CpuGeneration, string> = {
  "zen-3": "Zen 3 (Ryzen 5000)",
  "zen-4": "Zen 4 (Ryzen 7000)",
  "zen-5": "Zen 5 (Ryzen 9000)",
  "alder-lake": "Alder Lake (12th gen)",
  "raptor-lake": "Raptor Lake (13th gen)",
  "raptor-lake-refresh": "Raptor Lake Refresh (14th gen)",
  "arrow-lake": "Arrow Lake (Core Ultra 200S)",
}

// Every generation fits exactly one socket. CPU and motherboard schemas use
// this to reject a generation listed on the wrong socket.
export const CPU_GENERATION_SOCKET: Record<CpuGeneration, Socket> = {
  "zen-3": "AM4",
  "zen-4": "AM5",
  "zen-5": "AM5",
  "alder-lake": "LGA1700",
  "raptor-lake": "LGA1700",
  "raptor-lake-refresh": "LGA1700",
  "arrow-lake": "LGA1851",
}

export const MEMORY_TYPES = ["DDR4", "DDR5"] as const
export const memoryType = z.enum(MEMORY_TYPES)
export type MemoryType = z.infer<typeof memoryType>
export const MEMORY_TYPE_LABELS: Record<MemoryType, string> = {
  DDR4: "DDR4",
  DDR5: "DDR5",
}

// E_ATX is listed so cases can declare support; no E-ATX boards are stocked yet
export const MOTHERBOARD_FORM_FACTORS = [
  "E_ATX",
  "ATX",
  "MICRO_ATX",
  "MINI_ITX",
] as const
export const motherboardFormFactor = z.enum(MOTHERBOARD_FORM_FACTORS)
export type MotherboardFormFactor = z.infer<typeof motherboardFormFactor>
export const MOTHERBOARD_FORM_FACTOR_LABELS: Record<
  MotherboardFormFactor,
  string
> = {
  E_ATX: "E-ATX",
  ATX: "ATX",
  MICRO_ATX: "Micro-ATX",
  MINI_ITX: "Mini-ITX",
}

export const PSU_FORM_FACTORS = ["ATX", "SFX", "SFX_L"] as const
export const psuFormFactor = z.enum(PSU_FORM_FACTORS)
export type PsuFormFactor = z.infer<typeof psuFormFactor>
export const PSU_FORM_FACTOR_LABELS: Record<PsuFormFactor, string> = {
  ATX: "ATX",
  SFX: "SFX",
  SFX_L: "SFX-L",
}

// Numeric values, so this is a literal union rather than z.enum
export const RADIATOR_SIZES_MM = [120, 140, 240, 280, 360, 420] as const
export const radiatorSizeMm = z.literal(RADIATOR_SIZES_MM)
export type RadiatorSizeMm = z.infer<typeof radiatorSizeMm>

export const STORAGE_INTERFACES = ["NVME", "SATA"] as const
export const storageInterface = z.enum(STORAGE_INTERFACES)
export type StorageInterface = z.infer<typeof storageInterface>
export const STORAGE_INTERFACE_LABELS: Record<StorageInterface, string> = {
  NVME: "NVMe",
  SATA: "SATA",
}

export const STORAGE_FORM_FACTORS = [
  "M2_2230",
  "M2_2242",
  "M2_2280",
  "DRIVE_2_5",
  "DRIVE_3_5",
] as const
export const storageFormFactor = z.enum(STORAGE_FORM_FACTORS)
export type StorageFormFactor = z.infer<typeof storageFormFactor>
export const STORAGE_FORM_FACTOR_LABELS: Record<StorageFormFactor, string> = {
  M2_2230: "M.2 2230",
  M2_2242: "M.2 2242",
  M2_2280: "M.2 2280",
  DRIVE_2_5: '2.5"',
  DRIVE_3_5: '3.5"',
}

export const COOLER_TYPES = ["AIR", "AIO"] as const
export const coolerType = z.enum(COOLER_TYPES)
export type CoolerType = z.infer<typeof coolerType>
export const COOLER_TYPE_LABELS: Record<CoolerType, string> = {
  AIR: "Air",
  AIO: "Liquid (AIO)",
}

export const GPU_CHIPSET_BRANDS = ["NVIDIA", "AMD", "INTEL"] as const
export const gpuChipsetBrand = z.enum(GPU_CHIPSET_BRANDS)
export type GpuChipsetBrand = z.infer<typeof gpuChipsetBrand>
export const GPU_CHIPSET_BRAND_LABELS: Record<GpuChipsetBrand, string> = {
  NVIDIA: "NVIDIA",
  AMD: "AMD",
  INTEL: "Intel",
}

export const EFFICIENCY_RATINGS = [
  "WHITE",
  "BRONZE",
  "SILVER",
  "GOLD",
  "PLATINUM",
  "TITANIUM",
] as const
export const efficiencyRating = z.enum(EFFICIENCY_RATINGS)
export type EfficiencyRating = z.infer<typeof efficiencyRating>
export const EFFICIENCY_RATING_LABELS: Record<EfficiencyRating, string> = {
  WHITE: "80 PLUS",
  BRONZE: "80 PLUS Bronze",
  SILVER: "80 PLUS Silver",
  GOLD: "80 PLUS Gold",
  PLATINUM: "80 PLUS Platinum",
  TITANIUM: "80 PLUS Titanium",
}

export const MODULARITIES = ["FULL", "SEMI", "NONE"] as const
export const modularity = z.enum(MODULARITIES)
export type Modularity = z.infer<typeof modularity>
export const MODULARITY_LABELS: Record<Modularity, string> = {
  FULL: "Fully modular",
  SEMI: "Semi-modular",
  NONE: "Non-modular",
}
