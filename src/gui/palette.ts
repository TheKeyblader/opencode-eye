export type EyeStyle = "realistic" | "cartoon"

export const STYLES: readonly EyeStyle[] = ["realistic", "cartoon"]

/** CSS colors: `#rrggbb`, or expressions over the app's theme variables. Apply them as styles, not attributes. */
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

/** Colors for when the app's theme variables are missing, such as outside the app. */
export const FALLBACK: Readonly<Record<"light" | "dark", Palette>> = {
  light: { sclera: "#ffffff", iris: "#3d78bb", pupil: "#111114", outline: "#2a2a2e", lid: "#dcd6d0" },
  dark: { sclera: "#ecebe6", iris: "#5f9fe6", pupil: "#0d0d0f", outline: "#d4d4d8", lid: "#3b3a38" },
}

const token = (name: string, fallback: string) => `var(--${name}, ${fallback})`

/**
 * The eye in the colors of the app's theme (Nord, OpenCode, …), read from the CSS variables the app derives from the
 * theme's palette: its `primary` color (`--surface-brand-base`) for the iris, its ink (`--text-*`) for the outline,
 * its background for the lid. These variables are the app's, not the SDK's: each falls back on `FALLBACK`.
 */
export function themePalette(mode: "light" | "dark"): Palette {
  const fallback = FALLBACK[mode]
  const dark = mode === "dark"
  // The ink is dark on a light theme and light on a dark one; the pupil stays dark and the white stays light.
  const ink = token("text-strong", dark ? fallback.sclera : fallback.outline)
  const background = token("background-base", dark ? "#1c1c1f" : "#f6f6f4")

  return {
    sclera: dark ? ink : token("surface-raised-stronger-non-alpha", fallback.sclera),
    iris: token("surface-brand-base", fallback.iris),
    pupil: dark ? `color-mix(in srgb, ${background} 85%, black)` : ink,
    outline: dark ? token("text-base", fallback.outline) : ink,
    lid: `color-mix(in srgb, ${background} 72%, ${token("text-base", dark ? "#a0a0a0" : "#6f6f6f")})`,
  }
}

const HEX = /^#[0-9a-f]{6}$/i

export const isHex = (value: string) => HEX.test(value)

/** The theme's palette, with each color the user set in its place. A value that is not `#rrggbb` is ignored. */
export function resolvePalette(mode: "light" | "dark", choice: ColorChoice): Palette {
  const theme = themePalette(mode)
  const pick = (key: keyof ColorChoice) => (isHex(choice[key]) ? choice[key] : theme[key])

  return { ...theme, iris: pick("iris"), pupil: pick("pupil"), outline: pick("outline") }
}

/** `rgb(…)`/`rgba(…)` as computed by the browser, to `#rrggbb` for a color input. */
export function rgbToHex(rgb: string): string | undefined {
  const match = /rgba?\(\s*(\d+(?:\.\d+)?)[ ,]+(\d+(?:\.\d+)?)[ ,]+(\d+(?:\.\d+)?)/i.exec(rgb)

  if (!match) return undefined
  return `#${match
    .slice(1, 4)
    .map((part) => Math.round(Number(part)).toString(16).padStart(2, "0"))
    .join("")}`
}

/** What a CSS color (variables and `color-mix` included) computes to under `element`, as `#rrggbb`. */
export function computedHex(color: string, element: Element): string | undefined {
  const probe = document.createElement("span")

  probe.style.color = color
  probe.style.display = "none"
  element.appendChild(probe)
  const computed = getComputedStyle(probe).color

  probe.remove()
  return rgbToHex(computed)
}

export const SIZE = { min: 80, max: 320, step: 8, initial: 160 } as const

export function clampSize(size: number): number {
  if (!Number.isFinite(size)) return SIZE.initial
  return Math.min(SIZE.max, Math.max(SIZE.min, Math.round(size)))
}
