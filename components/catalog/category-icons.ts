import {
  CircuitBoardIcon,
  CpuIcon,
  FanIcon,
  GpuIcon,
  HardDriveIcon,
  type LucideIcon,
  MemoryStickIcon,
  PackageIcon,
  PcCaseIcon,
  PlugZapIcon,
} from "lucide-react"

import { type BuilderCategorySlug, isBuilderCategory } from "@/lib/specs"

// One icon per builder category: the home page's category tiles and the
// placeholder product images (scripts/generate-placeholders.tsx) share it.
// A Record type makes a missing category a type error.
export const categoryIcons: Record<BuilderCategorySlug, LucideIcon> = {
  cpu: CpuIcon,
  motherboard: CircuitBoardIcon,
  memory: MemoryStickIcon,
  storage: HardDriveIcon,
  gpu: GpuIcon,
  case: PcCaseIcon,
  psu: PlugZapIcon,
  "cpu-cooler": FanIcon,
}

// A category's icon; a generic one for categories without specs
export function categoryIcon(slug: string): LucideIcon {
  return isBuilderCategory(slug) ? categoryIcons[slug] : PackageIcon
}
