/**
 * The eye's appearance settings. Its colors are CSS tokens (see eye.css): the app's theme drives them, and the user may
 * set the accent and the error color.
 */

export type Stroke = "thin" | "normal" | "bold"

export const STROKES = ["thin", "normal", "bold"] as const satisfies readonly Stroke[]

/** The line width of each stroke, in viewBox units: the mock-up's is 3.5. */
const STROKE_WIDTH: Readonly<Record<Stroke, number>> = { thin: 2.5, normal: 3.5, bold: 4.5 }

export const strokeWidth = (stroke: Stroke) => STROKE_WIDTH[stroke]

/** The colors a user can set: `#rrggbb`, or empty to follow the theme. */
export interface Colors {
  /** The outline, the pupil and the props. The theme's accent (`--surface-brand-base`) by default. */
  readonly contour: string
  readonly error: string
}

export const COLORS: readonly (keyof Colors)[] = ["contour", "error"]

/** The token each color sets, to read what the theme computes it to. */
export const TOKENS: Readonly<Record<keyof Colors, string>> = { contour: "var(--contour)", error: "var(--err)" }

const HEX = /^#[0-9a-f]{6}$/i

export const isHex = (value: string) => HEX.test(value)

/** The user's colors, with anything that is not `#rrggbb` left to the theme. */
export function resolveColors(choice: Colors): Colors {
  return { contour: isHex(choice.contour) ? choice.contour : "", error: isHex(choice.error) ? choice.error : "" }
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

/** The eye's width, in px. `0` is automatic: `AUTO_RATIO` of the panel's width. */
export const SIZE = { min: 80, max: 300, step: 4, auto: 0 } as const

export const AUTO_RATIO = 0.6

/** Under this width, the scene and the props hide: only the eye stays readable. */
export const COMPACT = 120

export function clampSize(size: number): number {
  if (!Number.isFinite(size)) return SIZE.min
  return Math.min(SIZE.max, Math.max(SIZE.min, Math.round(size)))
}

/** The eye's width for a setting and the width of the room it has. */
export function eyeSize(setting: number, room: number): number {
  if (setting !== SIZE.auto) return clampSize(setting)
  return clampSize(room > 0 ? room * AUTO_RATIO : 160)
}
