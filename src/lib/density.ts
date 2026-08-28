import type { Density } from "@/types"

export const DENSITY_CONFIG: Record<
  Density,
  { icon: number; cols: number; rows: number; panel: number; label: string }
> = {
  comfortable: { icon: 52, cols: 3, rows: 2, panel: 300, label: "Comfortable" },
  compact: { icon: 42, cols: 4, rows: 2, panel: 292, label: "Compact" },
  tiny: { icon: 34, cols: 4, rows: 3, panel: 268, label: "Tiny" },
}

export function pageSize(density: Density) {
  const { cols, rows } = DENSITY_CONFIG[density]
  return cols * rows
}
