import { describe, expect, test } from "bun:test"
import { clampSize, FALLBACK, resolvePalette, rgbToHex, SIZE, themePalette } from "../src/gui/palette"

const NONE = { iris: "", pupil: "", outline: "" }

describe("themePalette", () => {
  test("reads the app's theme variables, with a fallback for each", () => {
    for (const mode of ["light", "dark"] as const) {
      const palette = themePalette(mode)

      expect(palette.iris).toBe(`var(--surface-brand-base, ${FALLBACK[mode].iris})`)
      for (const color of Object.values(palette)) expect(color).toContain("var(--")
    }
  })

  test("keeps the pupil dark and the white light in both modes", () => {
    expect(themePalette("light").pupil).toContain("--text-strong")
    expect(themePalette("dark").pupil).toContain("black")
    expect(themePalette("dark").sclera).toContain("--text-strong")
    expect(themePalette("light").sclera).toContain("#ffffff")
  })
})

describe("rgbToHex", () => {
  test("converts what getComputedStyle returns", () => {
    expect(rgbToHex("rgb(94, 129, 172)")).toBe("#5e81ac")
    expect(rgbToHex("rgba(46, 52, 64, 0.5)")).toBe("#2e3440")
    expect(rgbToHex("rgb(94 129 172)")).toBe("#5e81ac")
    expect(rgbToHex("color(srgb 1 0 0)")).toBeUndefined()
  })
})

describe("resolvePalette", () => {
  test("follows the theme while no color is set", () => {
    expect(resolvePalette("light", NONE)).toEqual(themePalette("light"))
    expect(resolvePalette("dark", NONE)).toEqual(themePalette("dark"))
  })

  test("a color the user set wins, in both themes", () => {
    for (const mode of ["light", "dark"] as const) {
      const palette = resolvePalette(mode, { ...NONE, iris: "#2e8b57" })

      expect(palette.iris).toBe("#2e8b57")
      expect(palette.pupil).toBe(themePalette(mode).pupil)
      expect(palette.sclera).toBe(themePalette(mode).sclera)
    }
  })

  test("ignores a value that is not #rrggbb", () => {
    expect(resolvePalette("light", { ...NONE, outline: "red; background: url(x)" }).outline).toBe(
      themePalette("light").outline,
    )
  })
})

describe("clampSize", () => {
  test("keeps the size in range", () => {
    expect(clampSize(10)).toBe(SIZE.min)
    expect(clampSize(10_000)).toBe(SIZE.max)
    expect(clampSize(150.6)).toBe(151)
    expect(clampSize(Number.NaN)).toBe(SIZE.initial)
  })
})
