import { describe, expect, test } from "bun:test"
import { GALLERY } from "../src/gui/gallery"
import { en, fr } from "../src/gui/i18n"
import { lookKey } from "../src/gui/motion"
import type { Mood, ToolKind } from "../src/gui/state"

describe("GALLERY", () => {
  test("shows every mood and every tool kind", () => {
    const moods: Mood[] = ["idle", "thinking", "tool", "attention", "error", "sleeping"]
    const kinds: ToolKind[] = ["read", "edit", "shell", "generic"]

    expect(new Set(GALLERY.map((item) => item.look.mood))).toEqual(new Set(moods))
    expect(new Set(GALLERY.flatMap((item) => (item.look.kind ? [item.look.kind] : [])))).toEqual(new Set(kinds))
  })

  test("shows each look once", () => {
    expect(new Set(GALLERY.map((item) => lookKey(item.look))).size).toBe(GALLERY.length)
    expect(new Set(GALLERY.map((item) => item.key)).size).toBe(GALLERY.length)
  })

  test("has a title and a line of copy in each language", () => {
    for (const messages of [en, fr] as Record<string, string>[]) {
      for (const item of GALLERY) {
        expect(messages[`states.${item.key}`]).toBeTruthy()
        expect(messages[`states.${item.key}.text`]).toBeTruthy()
      }
    }
  })
})
