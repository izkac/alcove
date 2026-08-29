import type { Density } from "@/types"

export const DENSITY_CONFIG: Record<
  Density,
  { icon: number; cols: number; rows: number; panel: number; label: string }
> = {
  comfortable: { icon: 52, cols: 6, rows: 4, panel: 620, label: "Comfortable" },
  compact: { icon: 42, cols: 7, rows: 5, panel: 580, label: "Compact" },
  tiny: { icon: 34, cols: 8, rows: 6, panel: 540, label: "Tiny" },
}

export function pageSize(density: Density) {
  const { cols, rows } = DENSITY_CONFIG[density]
  return cols * rows
}
