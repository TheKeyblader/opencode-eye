import { describe, expect, test } from "bun:test"
import { GALLERY, modsOf } from "../src/gui/gallery"
import { en, fr } from "../src/gui/i18n"
import { STATES } from "../src/gui/machine"

describe("GALLERY", () => {
  test("shows each of the 18 states once, then the 3 modifiers", () => {
    expect(GALLERY.filter((item) => !item.mod).map((item) => item.state)).toEqual([...STATES])
    expect(GALLERY.filter((item) => item.mod).map((item) => item.mod)).toEqual(["impatient", "bored", "tired"])
    expect(new Set(GALLERY.map((item) => item.key)).size).toBe(GALLERY.length)
  })

  test("every card has its text, and every state its label, in English and French", () => {
    for (const item of GALLERY) {
      expect(Object.keys(en)).toContain(`states.${item.key}`)
      expect(Object.keys(fr)).toContain(`states.${item.key}`)
    }
    for (const state of STATES) expect(Object.keys(fr)).toContain(`state.${state}`)
  })

  test("the tool states show a tool, and a modifier turns itself on", () => {
    expect(GALLERY.find((item) => item.key === "read")?.tool).toBe("grep")
    expect(modsOf(GALLERY.find((item) => item.key === "tired")!)).toEqual({ impatient: false, bored: false, tired: true })
  })
})
