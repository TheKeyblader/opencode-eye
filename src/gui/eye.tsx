import { createUniqueId, For, onCleanup, Show } from "solid-js"
import { createKeyed } from "@opencode/plugin/gui"
import {
  behavior,
  clampDisc,
  GAZE,
  LID,
  lookKey,
  pointerGaze,
  PUPIL,
  REST,
  step,
  type Behavior,
  type Look,
  type Pose,
  type Spring,
} from "./motion"
import type { EyeStyle, Palette } from "./palette"

// Geometry, in the 100×100 viewBox centered on the eye.
const R = 40
const UPPER_BULGE = 10
const LOWER_BULGE = 6

interface Geometry {
  readonly iris: number
  readonly pupil: number
  readonly outline: number
  readonly lash: number
  /** Shaded iris with a darker rim, or one flat color. */
  readonly shaded: boolean
  /** Catchlights: x, y, radius, relative to the iris center. */
  readonly highlights: readonly (readonly [number, number, number])[]
}

const GEOMETRY: Readonly<Record<EyeStyle, Geometry>> = {
  realistic: { iris: 17, pupil: 7.5, outline: 2.5, lash: 2.4, shaded: true, highlights: [[-5, -6, 3]] },
  cartoon: {
    iris: 15,
    pupil: 10,
    outline: 4.5,
    lash: 4,
    shaded: false,
    highlights: [
      [-4, -5, 4],
      [4.5, 3.5, 1.8],
    ],
  },
}

function spiral(radius: number): string {
  const turns = 3
  const points: string[] = []

  for (let i = 0; i <= turns * 32; i++) {
    const angle = (i / 32) * Math.PI * 2
    const r = (radius * i) / (turns * 32)

    points.push(`${(Math.cos(angle) * r).toFixed(2)} ${(Math.sin(angle) * r).toFixed(2)}`)
  }

  return `M ${points.join(" L ")}`
}

const spring = (value: number): Spring => ({ value, velocity: 0 })

/**
 * The animated eye. Its frame loop runs only while `visible`, and follows the pointer only while idle and visible.
 * Each frame writes the SVG attributes directly: nothing re-renders.
 */
export function Eye(props: {
  readonly look: Look
  readonly size: number
  readonly style: EyeStyle
  readonly palette: Palette
  readonly label: string
  /** Whether the eye is on screen, such as `usePanel().visible`. */
  readonly visible: () => boolean
  /** A fixed pose to draw instead of animating, for previews. */
  readonly still?: Pose
}) {
  const ids = { clip: createUniqueId(), iris: createUniqueId() }
  const calm = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches
  const geometry = () => GEOMETRY[props.style] ?? GEOMETRY.realistic
  const gaze = { x: spring(0), y: spring(0) }
  const lid = spring(1)
  const pupil = spring(1)
  let svg: SVGSVGElement | undefined
  let iris: SVGGElement | undefined
  let pupilDot: SVGCircleElement | undefined
  let upper: SVGPathElement | undefined
  let lower: SVGPathElement | undefined
  let lash: SVGPathElement | undefined
  let pointer: { x: number; y: number } | undefined
  let last: Pose = props.still ?? REST

  let key = ""
  let current: Behavior | undefined
  let born = 0

  const draw = (pose: Pose) => {
    const { x, y } = pose
    const shape = geometry()
    const travel = R - shape.iris - 4
    const length = Math.hypot(x, y)
    const angle = (Math.atan2(y, x) * 180) / Math.PI
    // Foreshortening: the iris narrows along the direction it turns to.
    const squash = 1 - 0.16 * Math.min(1, length)
    const o = Math.max(0, Math.min(1.25, pose.open))
    const top = -R - 4 + (1 - o) * (R + 6)
    const bottom = R + 4 - (1 - o) * (R + 2)

    last = pose
    iris?.setAttribute(
      "transform",
      `translate(${(x * travel).toFixed(2)} ${(y * travel).toFixed(2)}) rotate(${angle.toFixed(1)}) scale(${squash.toFixed(3)} 1) rotate(${(-angle).toFixed(1)})`,
    )
    pupilDot?.setAttribute("r", (shape.pupil * Math.max(0.3, pose.pupil)).toFixed(2))
    upper?.setAttribute("d", `M -60 -60 H 60 V ${top} Q 0 ${top + UPPER_BULGE * 2} -60 ${top} Z`)
    lash?.setAttribute("d", `M -60 ${top} Q 0 ${top + UPPER_BULGE * 2} 60 ${top}`)
    lower?.setAttribute("d", `M -60 60 H 60 V ${bottom} Q 0 ${bottom - LOWER_BULGE * 2} -60 ${bottom} Z`)
  }

  // Draw on mount, for a new still pose, and when the style changes the geometry while the loop is paused.
  createKeyed(
    () => props.still ?? props.style,
    () => queueMicrotask(() => draw(props.still ?? last)),
  )

  // Frame loop, while the eye shows.
  createKeyed(
    () => !props.still && props.visible(),
    () => {
      let previous = performance.now()
      let frame = 0

      const tick = (now: number) => {
        const look = props.look
        const next = lookKey(look)

        if (next !== key || !current) {
          key = next
          current = behavior(look, Math.random, calm)
          born = now
        }

        // An eye shown again after a while must not jump: cap the step.
        const dt = Math.min((now - previous) / 1000, 1 / 30)
        previous = now

        const target = current.target((now - born) / 1000, { pointer: look.mood === "idle" ? pointer : undefined })

        step(gaze.x, target.x, dt, GAZE)
        step(gaze.y, target.y, dt, GAZE)
        step(lid, target.open, dt, LID)
        step(pupil, target.pupil, dt, PUPIL)
        draw({ ...clampDisc(gaze.x.value, gaze.y.value, 1.05), open: lid.value, pupil: pupil.value })
        frame = requestAnimationFrame(tick)
      }

      frame = requestAnimationFrame(tick)
      onCleanup(() => cancelAnimationFrame(frame))
    },
  )

  // Pointer tracking, only while idle and visible. Moves are folded into one read per animation frame.
  createKeyed(
    () => !props.still && props.visible() && props.look.mood === "idle",
    () => {
      let latest: PointerEvent | undefined
      let frame = 0

      const read = () => {
        frame = 0
        if (!latest || !svg) return
        const box = svg.getBoundingClientRect()

        pointer = pointerGaze(latest.clientX - (box.left + box.width / 2), latest.clientY - (box.top + box.height / 2))
      }
      const move = (event: PointerEvent) => {
        latest = event
        if (!frame) frame = requestAnimationFrame(read)
      }
      const leave = () => {
        latest = undefined
        pointer = undefined
      }

      window.addEventListener("pointermove", move, { passive: true })
      document.documentElement.addEventListener("pointerleave", leave)
      onCleanup(() => {
        window.removeEventListener("pointermove", move)
        document.documentElement.removeEventListener("pointerleave", leave)
        if (frame) cancelAnimationFrame(frame)
        pointer = undefined
      })
    },
  )

  return (
    <svg
      ref={svg}
      class="opencode-eye__svg"
      classList={{ "opencode-eye__svg--stuck": !!props.look.stuck }}
      data-style={props.style}
      viewBox="-50 -50 100 100"
      width={props.size}
      height={props.size}
      role="img"
      aria-label={props.label}
    >
      <defs>
        <clipPath id={ids.clip}>
          <circle r={R} />
        </clipPath>
        <radialGradient id={ids.iris}>
          <stop offset="0%" style={{ "stop-color": `color-mix(in srgb, ${props.palette.iris} 55%, white)` }} />
          <stop offset="70%" style={{ "stop-color": props.palette.iris }} />
          <stop offset="100%" style={{ "stop-color": `color-mix(in srgb, ${props.palette.iris} 60%, black)` }} />
        </radialGradient>
      </defs>
      <circle r={R} style={{ fill: props.palette.sclera }} />
      <g clip-path={`url(#${ids.clip})`}>
        <g ref={iris}>
          <circle
            r={geometry().iris}
            style={{
              fill: geometry().shaded ? `url(#${ids.iris})` : props.palette.iris,
              stroke: geometry().shaded ? `color-mix(in srgb, ${props.palette.iris} 45%, black)` : "none",
            }}
            stroke-width="1.2"
          />
          <circle ref={pupilDot} r={geometry().pupil} style={{ fill: props.palette.pupil }} />
          <Show when={props.look.stuck}>
            <path
              class="opencode-eye__spiral"
              d={spiral(geometry().iris - 2)}
              fill="none"
              style={{ stroke: props.palette.sclera }}
              stroke-width="1.6"
            />
          </Show>
          <For each={geometry().highlights}>
            {([x, y, r]) => <circle cx={x} cy={y} r={r} fill="white" opacity="0.85" />}
          </For>
        </g>
        <path ref={upper} style={{ fill: props.palette.lid }} />
        <path ref={lower} style={{ fill: props.palette.lid }} />
        <path
          ref={lash}
          fill="none"
          style={{ stroke: props.palette.outline }}
          stroke-width={geometry().lash}
          stroke-linecap="round"
        />
      </g>
      <circle r={R} fill="none" style={{ stroke: props.palette.outline }} stroke-width={geometry().outline} />
      <Show when={props.look.mood === "sleeping"}>
        <g class="opencode-eye__zzz" style={{ fill: props.palette.outline }}>
          <text x="30" y="-30">
            z
          </text>
          <text x="36" y="-38">
            z
          </text>
          <text x="42" y="-46">
            z
          </text>
        </g>
      </Show>
    </svg>
  )
}
