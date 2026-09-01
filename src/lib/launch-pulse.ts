/**
 * "Yes, it is really starting" feedback on the icon you just clicked.
 *
 * Launching is fire-and-forget (ShellExecute), so there is no signal for when
 * the app's window actually appears — a fixed pulse bridges the cold-start gap.
 * Targets `data-desktop-icon` (grid/drawer tiles) and `data-launch-pulse`
 * (strip slots, which must stay out of the rubber-band selection query).
 */
export function pulseLaunch(id: string) {
  const key = CSS.escape(id)
  const nodes = document.querySelectorAll(
    `[data-desktop-icon="${key}"], [data-launch-pulse="${key}"]`,
  )
  for (const el of nodes) {
    el.animate(
      [
        { transform: "scale(1)", opacity: 1 },
        { transform: "scale(0.8)", opacity: 0.55 },
        { transform: "scale(1)", opacity: 1 },
      ],
      { duration: 450, iterations: 3, easing: "ease-in-out" },
    )
  }
}
