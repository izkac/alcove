import type { AlcoveColor } from "@/types"

export const ALCOVE_COLOR_STYLES: Record<
  AlcoveColor,
  { bar: string; glow: string; chip: string; label: string }
> = {
  sky: {
    bar: "bg-sky-400",
    glow: "shadow-sky-400/20",
    chip: "bg-sky-400/20 text-sky-100 ring-sky-300/35",
    label: "Sky",
  },
  violet: {
    bar: "bg-violet-400",
    glow: "shadow-violet-400/20",
    chip: "bg-violet-400/20 text-violet-100 ring-violet-300/35",
    label: "Violet",
  },
  amber: {
    bar: "bg-amber-400",
    glow: "shadow-amber-400/20",
    chip: "bg-amber-400/20 text-amber-100 ring-amber-300/35",
    label: "Amber",
  },
  emerald: {
    bar: "bg-emerald-400",
    glow: "shadow-emerald-400/20",
    chip: "bg-emerald-400/20 text-emerald-100 ring-emerald-300/35",
    label: "Emerald",
  },
  rose: {
    bar: "bg-rose-400",
    glow: "shadow-rose-400/20",
    chip: "bg-rose-400/20 text-rose-100 ring-rose-300/35",
    label: "Rose",
  },
  slate: {
    bar: "bg-slate-300",
    glow: "shadow-slate-300/20",
    chip: "bg-slate-300/20 text-slate-100 ring-slate-200/35",
    label: "Slate",
  },
}
