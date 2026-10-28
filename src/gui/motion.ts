/**
 * How the eye moves: a target pose per mood, and springs that chase it. Pure apart from the random source, which
 * tests replace. Time is in seconds.
 */
import type { Mood, ToolKind } from "./state"

/** Gaze in the unit disc (x right, y down), lid opening (0 closed, 1 open, above 1 wide), pupil scale. */
export interface Pose {
  readonly x: number
  readonly y: number
  readonly open: number
  readonly pupil: number
}

export interface Look {
  readonly mood: Mood
  readonly kind?: ToolKind
  /** An error that stays (not a tool's flash): the eye shows a spiral. */
  readonly stuck?: boolean
}

export interface BehaviorInput {
  /** The pointer as a gaze in the unit disc, or undefined when it is unknown. */
  readonly pointer?: { readonly x: number; readonly y: number }
}

export interface Behavior {
  target(t: number, input: BehaviorInput): Pose
}

export type Random = () => number

export const REST: Pose = { x: 0, y: 0, open: 1, pupil: 1 }

/** A stable key for a look, so the loop swaps behaviors only when the look changes. */
export const lookKey = (look: Look) => `${look.mood}:${look.kind ?? ""}:${look.stuck ? 1 : 0}`

// ---------------------------------------------------------------------------------------------------------------------
// Springs

export interface Spring {
  value: number
  velocity: number
}

export interface SpringConfig {
  /** Stiffness: higher is faster. */
  readonly k: number
  /** Damping: below 2·√k the spring overshoots, which reads as elastic. */
  readonly c: number
}

// Underdamped (ζ ≈ 0.55): the gaze overshoots a little and settles, as a heavy eyeball would.
export const GAZE: SpringConfig = { k: 170, c: 14 }
// Stiff enough that a 110 ms blink closes the lid.
export const LID: SpringConfig = { k: 900, c: 48 }
export const PUPIL: SpringConfig = { k: 90, c: 13 }

/** Advances a spring by `dt` seconds towards `target` (semi-implicit Euler, sub-stepped for stability). */
export function step(spring: Spring, target: number, dt: number, config: SpringConfig): void {
  const steps = Math.max(1, Math.ceil(dt / (1 / 120)))
  const h = dt / steps

  for (let i = 0; i < steps; i++) {
    spring.velocity += (config.k * (target - spring.value) - config.c * spring.velocity) * h
    spring.value += spring.velocity * h
  }
}

/** Keeps a gaze inside the unit disc. */
export function clampDisc(x: number, y: number, radius = 1): { x: number; y: number } {
  const length = Math.hypot(x, y)

  return length <= radius ? { x, y } : { x: (x / length) * radius, y: (y / length) * radius }
}

/** Maps a pointer offset from the eye's center, in CSS pixels, to a gaze that saturates smoothly with distance. */
export function pointerGaze(dx: number, dy: number, reach = 140): { x: number; y: number } {
  const length = Math.hypot(dx, dy)

  if (length === 0) return { x: 0, y: 0 }
  const strength = length / (length + reach)

  return { x: (dx / length) * strength * 1.15, y: (dy / length) * strength * 1.15 }
}

// ---------------------------------------------------------------------------------------------------------------------
// Behaviors

const between = (random: Random, min: number, max: number) => min + (max - min) * random()
const easeInOut = (p: number) => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2)

/** Random blinks: closes the lid for a beat every few seconds, sometimes twice. */
function blinker(random: Random, min: number, max: number) {
  let next = between(random, min, max)
  let until = -1
  let again = false

  return (t: number): boolean => {
    if (t >= next && t >= until) {
      until = t + 0.11
      again = !again && random() < 0.18
      next = again ? until + 0.12 : until + between(random, min, max)
    }

    return t < until
  }
}

/** Jumps to a new point every so often, holding still in between, as eyes do. */
function saccades(random: Random, min: number, max: number, pick: () => { x: number; y: number }) {
  let next = 0
  let point = { x: 0, y: 0 }

  return (t: number) => {
    if (t >= next) {
      point = pick()
      next = t + between(random, min, max)
    }

    return point
  }
}

function idle(random: Random, calm: boolean): Behavior {
  const blink = blinker(random, 2.5, 6)
  const wander = saccades(random, 1.2, 3, () => clampDisc(between(random, -0.4, 0.4), between(random, -0.3, 0.3)))

  return {
    target: (t, input) => {
      const gaze = input.pointer ?? (calm ? { x: 0, y: 0 } : wander(t))

      return { ...clampDisc(gaze.x, gaze.y), open: !calm && blink(t) ? 0 : 1, pupil: 1 }
    },
  }
}

/** Up and to one side, with small jumps, switching side now and then. */
function thinking(random: Random, calm: boolean): Behavior {
  const blink = blinker(random, 3, 7)
  let side = random() < 0.5 ? -1 : 1
  let switchAt = between(random, 3, 6)
  const jitter = saccades(random, 0.25, 0.7, () => ({ x: between(random, -0.12, 0.12), y: between(random, -0.1, 0.1) }))

  return {
    target: (t) => {
      if (!calm && t >= switchAt) {
        side = -side
        switchAt = t + between(random, 3, 6)
      }
      const offset = calm ? { x: 0, y: 0 } : jitter(t)

      return { ...clampDisc(side * 0.55 + offset.x, -0.62 + offset.y), open: !calm && blink(t) ? 0 : 0.95, pupil: 0.95 }
    },
  }
}

export const LINE_S = 1.1
const LINES = 4

/** Left to right along a line, a quick return, one line lower: reading. */
function reading(random: Random, calm: boolean): Behavior {
  const blink = blinker(random, 4, 8)

  return {
    target: (t) => {
      if (calm) return { x: 0, y: 0, open: 0.92, pupil: 0.95 }
      const line = Math.floor(t / LINE_S)
      const p = (t % LINE_S) / LINE_S
      // Most of the period reads, the rest snaps back to the start of the next line.
      const x = p < 0.82 ? -0.65 + 1.3 * (p / 0.82) : -0.65
      const y = -0.3 + 0.2 * ((p < 0.82 ? line : line + 1) % LINES)

      return { x, y, open: blink(t) ? 0 : 0.92, pupil: 0.95 }
    },
  }
}

/** Looking down at the work, lid half closed, small sideways moves. */
function editing(random: Random, calm: boolean): Behavior {
  const blink = blinker(random, 4, 9)
  const phase = random() * Math.PI * 2

  return {
    target: (t) => ({
      x: calm ? 0 : 0.18 * Math.sin(t * 1.7 + phase),
      y: 0.62,
      open: !calm && blink(t) ? 0 : 0.52,
      pupil: 1,
    }),
  }
}

/** A narrow pupil and a fixed stare, with a tremor too small to be a move. */
function shell(random: Random, calm: boolean): Behavior {
  const blink = blinker(random, 6, 12)

  return {
    target: (t) => ({
      x: calm ? 0 : 0.02 * Math.sin(t * 23),
      y: calm ? 0.05 : 0.05 + 0.015 * Math.sin(t * 31),
      open: !calm && blink(t) ? 0 : 0.85,
      pupil: 0.5,
    }),
  }
}

/** Looking around for the result: saccades across the eye. */
function generic(random: Random, calm: boolean): Behavior {
  const blink = blinker(random, 3, 7)
  const look = saccades(random, 0.5, 1.3, () => {
    const angle = random() * Math.PI * 2
    const radius = between(random, 0.35, 0.75)

    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius }
  })

  return {
    target: (t) => ({ ...(calm ? { x: 0, y: 0 } : look(t)), open: !calm && blink(t) ? 0 : 1, pupil: 1.05 }),
  }
}

/** Wide open, centered, staring at the user. No blink. */
function attention(): Behavior {
  return { target: () => ({ x: 0, y: 0, open: 1.18, pupil: 1.18 }) }
}

/** Rolling around the rim. */
function error(_random: Random, calm: boolean): Behavior {
  return {
    target: (t) => {
      if (calm) return { x: 0, y: 0.3, open: 0.75, pupil: 0.8 }
      const angle = t * Math.PI * 2 * 1.3

      return { x: Math.cos(angle) * 0.78, y: Math.sin(angle) * 0.78, open: 0.88, pupil: 0.8 }
    },
  }
}

export const SLEEP_S = 2.6

/** Closing slowly, looking down. */
function sleeping(_random: Random, calm: boolean): Behavior {
  return {
    target: (t) => {
      const p = calm ? 1 : Math.min(1, t / SLEEP_S)

      return { x: 0, y: 0.3, open: 1 - easeInOut(p), pupil: 0.8 }
    },
  }
}

/**
 * The behavior for a look. Its time starts at 0 when it is created.
 *
 * @param calm - Reduced motion: hold each pose, no blinks, saccades or rolls.
 */
export function behavior(look: Look, random: Random = Math.random, calm = false): Behavior {
  switch (look.mood) {
    case "idle":
      return idle(random, calm)
    case "thinking":
      return thinking(random, calm)
    case "attention":
      return attention()
    case "error":
      return error(random, calm)
    case "sleeping":
      return sleeping(random, calm)
    case "tool":
      switch (look.kind) {
        case "read":
          return reading(random, calm)
        case "edit":
          return editing(random, calm)
        case "shell":
          return shell(random, calm)
        default:
          return generic(random, calm)
      }
  }
}

/** The pose the springs reach after `seconds` of a look, frame by frame at 60 Hz: a still for previews. */
export function simulate(look: Look, seconds: number, random: Random = Math.random, calm = false): Pose {
  const b = behavior(look, random, calm)
  const x = { value: 0, velocity: 0 }
  const y = { value: 0, velocity: 0 }
  const open = { value: 1, velocity: 0 }
  const pupil = { value: 1, velocity: 0 }

  for (let t = 0; t < seconds; t += 1 / 60) {
    const target = b.target(t, {})

    step(x, target.x, 1 / 60, GAZE)
    step(y, target.y, 1 / 60, GAZE)
    step(open, target.open, 1 / 60, LID)
    step(pupil, target.pupil, 1 / 60, PUPIL)
  }

  return { ...clampDisc(x.value, y.value, 1.05), open: open.value, pupil: pupil.value }
}
