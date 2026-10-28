import { describe, expect, test } from "bun:test"
import { fr } from "../src/gui/i18n"
import { announced, formatDuration, statusDot, viewLabel } from "../src/gui/labels"
import { STATES, type EyeView } from "../src/gui/machine"

const t = (key: string) => fr[key as keyof typeof fr] ?? key
const view = (fields: Partial<EyeView>): EyeView => ({
  state: "idle",
  tool: null,
  count: 0,
  mods: { impatient: false, bored: false, tired: false },
  since: 0,
  history: [],
  ...fields,
})
const grep = { callId: "c1", name: "grep", kind: "read" as const, since: 0 }

describe("viewLabel", () => {
  test("the spec's labels", () => {
    expect(viewLabel(t, view({}))).toBe("Au repos")
    expect(viewLabel(t, view({ state: "read", tool: grep }))).toBe("Lit · grep")
    expect(viewLabel(t, view({ state: "error-spiral" }))).toBe("Quelque chose a échoué")
    expect(viewLabel(t, view({ state: "surprised" }))).toBe("Te revoilà")
  })

  test("the modifiers change it", () => {
    const mods = { impatient: true, bored: true, tired: false }

    expect(viewLabel(t, view({ mods }))).toBe("S'ennuie")
    expect(viewLabel(t, view({ state: "read", tool: grep, mods }))).toBe("Lit · grep · ça traîne")
  })

  test("every state has a label", () => {
    for (const state of STATES) expect(viewLabel(t, view({ state }))).not.toContain("state.")
  })
})

describe("announced", () => {
  test("only attention, the errors and the end of a run", () => {
    expect(STATES.filter(announced)).toEqual(["attention", "error-flash", "error", "error-spiral", "happy", "vexed"])
  })
})

describe("statusDot", () => {
  test("blinks while waiting, is red on an error, lit at work", () => {
    expect(statusDot("attention")).toBe("att")
    expect(statusDot("error")).toBe("err")
    expect(statusDot("read")).toBe("on")
    expect(statusDot("idle")).toBe("")
  })
})

describe("formatDuration", () => {
  test("short durations", () => {
    expect(formatDuration(400)).toBe("< 1 s")
    expect(formatDuration(42_000)).toBe("42 s")
    expect(formatDuration(185_000)).toBe("3 min 05 s")
    expect(formatDuration(3_720_000)).toBe("1 h 02 min")
  })
})
