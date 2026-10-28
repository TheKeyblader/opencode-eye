import { describe, expect, test } from "bun:test"
import { clampSize, resolvePalette, SIZE, themePalette } from "../src/gui/palette"

const NONE = { iris: "", pupil: "", outline: "" }

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
