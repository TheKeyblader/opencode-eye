import { describe, expect, test } from "bun:test"
import {
  behavior,
  clampDisc,
  GAZE,
  LID,
  LINE_S,
  lookKey,
  pointerGaze,
  simulate,
  SLEEP_S,
  step,
  type Look,
  type Pose,
  type Random,
} from "../src/gui/motion"

/** A seeded generator (mulberry32), so behaviors replay the same way. */
function seeded(seed = 42): Random {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Samples a behavior every 1/60 s for `seconds`. */
function sample(look: Look, seconds: number, calm = false, pointer?: { x: number; y: number }): Pose[] {
  const b = behavior(look, seeded(), calm)

  return Array.from({ length: Math.round(seconds * 60) }, (_, i) => b.target(i / 60, { pointer }))
}

const LOOKS: Look[] = [
  { mood: "idle" },
  { mood: "thinking" },
  { mood: "tool", kind: "read" },
  { mood: "tool", kind: "edit" },
  { mood: "tool", kind: "shell" },
  { mood: "tool", kind: "generic" },
  { mood: "attention" },
  { mood: "error" },
  { mood: "error", stuck: true },
  { mood: "sleeping" },
]

describe("springs", () => {
  test("the gaze overshoots a little, then settles on the target", () => {
    const spring = { value: 0, velocity: 0 }
    let peak = 0

    for (let i = 0; i < 120; i++) {
      step(spring, 1, 1 / 60, GAZE)
      peak = Math.max(peak, spring.value)
    }

    expect(peak).toBeGreaterThan(1.05)
    expect(peak).toBeLessThan(1.3)
    expect(spring.value).toBeCloseTo(1, 2)
  })

  test("a blink closes the lid within a tenth of a second", () => {
    const spring = { value: 1, velocity: 0 }

    for (let i = 0; i < 6; i++) step(spring, 0, 1 / 60, LID)
    expect(spring.value).toBeLessThan(0.35)
  })

  test("a long frame stays stable", () => {
    const spring = { value: 0, velocity: 0 }

    step(spring, 1, 1 / 30, GAZE)
    step(spring, 1, 1 / 30, GAZE)
    expect(Number.isFinite(spring.value)).toBe(true)
    expect(Math.abs(spring.value)).toBeLessThan(2)
  })
})

describe("geometry", () => {
  test("clampDisc keeps a gaze inside the eye", () => {
    expect(clampDisc(0.3, 0.4)).toEqual({ x: 0.3, y: 0.4 })

    const out = clampDisc(3, 4)

    expect(Math.hypot(out.x, out.y)).toBeCloseTo(1)
    expect(out.x / out.y).toBeCloseTo(3 / 4)
  })

  test("pointerGaze points at the pointer and saturates with distance", () => {
    const near = pointerGaze(20, 0)
    const far = pointerGaze(2000, 0)

    expect(near.x).toBeGreaterThan(0)
    expect(near.y).toBe(0)
    expect(far.x).toBeGreaterThan(near.x)
    expect(far.x).toBeLessThan(1.2)
    expect(pointerGaze(0, 0)).toEqual({ x: 0, y: 0 })
  })

  test("lookKey changes with the mood, the tool kind and a stuck error", () => {
    const keys = new Set(LOOKS.map(lookKey))

    expect(keys.size).toBe(LOOKS.length)
  })
})

describe("behaviors", () => {
  test("every pose stays in bounds", () => {
    for (const look of LOOKS) {
      for (const calm of [false, true]) {
        for (const pose of sample(look, 12, calm)) {
          expect(Math.hypot(pose.x, pose.y)).toBeLessThanOrEqual(1.0001)
          expect(pose.open).toBeGreaterThanOrEqual(0)
          expect(pose.open).toBeLessThanOrEqual(1.2)
          expect(pose.pupil).toBeGreaterThan(0.3)
          expect(pose.pupil).toBeLessThan(1.3)
        }
      }
    }
  })

  test("idle follows the pointer, and blinks now and then", () => {
    const poses = sample({ mood: "idle" }, 20, false, { x: 0.5, y: -0.2 })

    expect(poses.every((pose) => pose.x === 0.5 && pose.y === -0.2)).toBe(true)
    expect(poses.some((pose) => pose.open === 0)).toBe(true)
    expect(poses.filter((pose) => pose.open === 0).length).toBeLessThan(poses.length * 0.15)
  })

  test("thinking looks up and to the side", () => {
    const poses = sample({ mood: "thinking" }, 10)

    expect(poses.every((pose) => pose.y < -0.4)).toBe(true)
    expect(poses.every((pose) => Math.abs(pose.x) > 0.3)).toBe(true)
  })

  test("reading sweeps left to right, then returns", () => {
    const b = behavior({ mood: "tool", kind: "read" }, seeded())
    const line = Array.from({ length: 10 }, (_, i) => b.target((i / 10) * LINE_S * 0.8, {}).x)

    for (let i = 1; i < line.length; i++) expect(line[i]!).toBeGreaterThan(line[i - 1]!)
    expect(b.target(LINE_S * 0.9, {}).x).toBeLessThan(line[0]! + 0.01)
  })

  test("editing looks down with the lid half closed", () => {
    const poses = sample({ mood: "tool", kind: "edit" }, 8).filter((pose) => pose.open > 0)

    expect(poses.every((pose) => pose.y > 0.5 && pose.open < 0.6)).toBe(true)
  })

  test("a shell stares with a narrow pupil", () => {
    const poses = sample({ mood: "tool", kind: "shell" }, 8)

    expect(poses.every((pose) => pose.pupil < 0.6 && Math.hypot(pose.x, pose.y) < 0.1)).toBe(true)
  })

  test("attention opens wide and stares at the center, without blinking", () => {
    const poses = sample({ mood: "attention" }, 10)

    expect(poses.every((pose) => pose.open > 1 && pose.x === 0 && pose.y === 0)).toBe(true)
  })

  test("an error rolls the eye around the rim", () => {
    const poses = sample({ mood: "error" }, 1)
    const angles = new Set(poses.map((pose) => (Math.round((Math.atan2(pose.y, pose.x) * 4) / Math.PI) + 8) % 8))

    expect(angles.size).toBe(8)
  })

  test("sleeping closes slowly and stays closed", () => {
    const b = behavior({ mood: "sleeping" }, seeded())

    expect(b.target(0, {}).open).toBe(1)
    expect(b.target(SLEEP_S / 2, {}).open).toBeCloseTo(0.5, 1)
    expect(b.target(SLEEP_S, {}).open).toBe(0)
    expect(b.target(SLEEP_S * 3, {}).open).toBe(0)
  })

  test("reduced motion holds each pose still", () => {
    for (const look of LOOKS) {
      if (look.mood === "idle") continue
      const poses = sample(look, 6, true)
      const first = poses[0]!

      expect(poses.every((pose) => pose.x === first.x && pose.y === first.y && pose.open === first.open)).toBe(true)
    }
  })
})

describe("simulate", () => {
  test("settles on the look's pose", () => {
    const edit = simulate({ mood: "tool", kind: "edit" }, 2, seeded(), true)

    expect(edit.y).toBeCloseTo(0.62, 1)
    expect(edit.open).toBeCloseTo(0.52, 1)

    const asleep = simulate({ mood: "sleeping" }, SLEEP_S + 1, seeded())

    expect(asleep.open).toBeLessThan(0.02)
  })
})
