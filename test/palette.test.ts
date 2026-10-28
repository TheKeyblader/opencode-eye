import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { clampSize, COMPACT, eyeSize, resolveColors, rgbToHex, SIZE, strokeWidth } from "../src/gui/palette"

const css = readFileSync(new URL("../src/gui/eye.css", import.meta.url), "utf8")

describe("the CSS tokens", () => {
  test("come from the app's theme, with the mock-up's values as fallbacks", () => {
    expect(css).toContain("--bg: var(--background-base, #16181d)")
    expect(css).toContain("--muted: var(--icon-base, #8d929d)")
    expect(css).toContain("--contour: var(--surface-brand-base, #8fb3ff)")
    expect(css).toContain("--contour: var(--surface-brand-base, #2f55c8)")
  })

  test("never read --text-base, which the app also uses as a font size, nor the unthemed --v2-* scale", () => {
    expect(css).not.toContain("--text-base")
    expect(css).not.toContain("--v2-")
  })

  test("every rule sits under the eye's root, so the app's classes stay untouched", () => {
    const selectors = css
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/@keyframes[^{]+\{(?:[^{}]*\{[^}]*\})*\s*\}/g, "")
      .match(/[^{}]+(?=\{)/g)!
      .flatMap((group) => group.split(","))
      .map((selector) => selector.trim())

    for (const selector of selectors) expect(selector).toMatch(/^\.opencode-eye/)
  })
})

describe("resolveColors", () => {
  test("keeps #rrggbb and leaves anything else to the theme", () => {
    expect(resolveColors({ contour: "#2e8b57", error: "red; background: url(x)" })).toEqual({
      contour: "#2e8b57",
      error: "",
    })
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

describe("size", () => {
  test("stays within 80 to 300 px", () => {
    expect(clampSize(10)).toBe(SIZE.min)
    expect(clampSize(1000)).toBe(SIZE.max)
    expect(clampSize(Number.NaN)).toBe(SIZE.min)
  })

  test("automatic: 60 % of the panel", () => {
    expect(eyeSize(SIZE.auto, 300)).toBe(180)
    expect(eyeSize(SIZE.auto, 100)).toBe(SIZE.min)
    expect(eyeSize(200, 300)).toBe(200)
  })

  test("the scene hides under 120 px, and the mock-up's stroke is the normal one", () => {
    expect(COMPACT).toBe(120)
    expect(strokeWidth("normal")).toBe(3.5)
  })
})
