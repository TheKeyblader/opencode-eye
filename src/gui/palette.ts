export type EyeStyle = "realistic" | "cartoon"

export const STYLES: readonly EyeStyle[] = ["realistic", "cartoon"]

export interface Palette {
  readonly sclera: string
  readonly iris: string
  readonly pupil: string
  readonly outline: string
  readonly lid: string
}

/** The colors a user can set. An empty string follows the theme. */
export interface ColorChoice {
  readonly iris: string
  readonly pupil: string
  readonly outline: string
}

export const COLORS: readonly (keyof ColorChoice)[] = ["iris", "pupil", "outline"]

export function themePalette(mode: "light" | "dark"): Palette {
  return mode === "dark"
    ? { sclera: "#ecebe6", iris: "#5f9fe6", pupil: "#0d0d0f", outline: "#d4d4d8", lid: "#3b3a38" }
    : { sclera: "#ffffff", iris: "#3d78bb", pupil: "#111114", outline: "#2a2a2e", lid: "#dcd6d0" }
}

const HEX = /^#[0-9a-f]{6}$/i

/** The theme's palette, with each color the user set in its place. A value that is not `#rrggbb` is ignored. */
export function resolvePalette(mode: "light" | "dark", choice: ColorChoice): Palette {
  const theme = themePalette(mode)
  const pick = (key: keyof ColorChoice) => (HEX.test(choice[key]) ? choice[key] : theme[key])

  return { ...theme, iris: pick("iris"), pupil: pick("pupil"), outline: pick("outline") }
}

export const SIZE = { min: 80, max: 320, step: 8, initial: 160 } as const

export function clampSize(size: number): number {
  if (!Number.isFinite(size)) return SIZE.initial
  return Math.min(SIZE.max, Math.max(SIZE.min, Math.round(size)))
}
