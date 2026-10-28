import { createUniqueId, onCleanup, Show } from "solid-js"
import { createKeyed, usePanel } from "@opencode/plugin/gui"
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

export interface Palette {
  readonly sclera: string
  readonly iris: string
  readonly pupil: string
  readonly outline: string
  readonly lid: string
}

export function themePalette(mode: "light" | "dark"): Palette {
  return mode === "dark"
    ? { sclera: "#ecebe6", iris: "#5f9fe6", pupil: "#0d0d0f", outline: "#d4d4d8", lid: "#3b3a38" }
    : { sclera: "#ffffff", iris: "#3d78bb", pupil: "#111114", outline: "#2a2a2e", lid: "#dcd6d0" }
}

// Geometry, in the 100×100 viewBox centered on the eye.
const R = 40
const IRIS = 17
const PUPIL_R = 7.5
const TRAVEL = R - IRIS - 4
const UPPER_BULGE = 10
const LOWER_BULGE = 6

const SPIRAL = (() => {
  const turns = 3
  const points: string[] = []

  for (let i = 0; i <= turns * 32; i++) {
    const angle = (i / 32) * Math.PI * 2
    const radius = ((IRIS - 2) * i) / (turns * 32)

    points.push(`${(Math.cos(angle) * radius).toFixed(2)} ${(Math.sin(angle) * radius).toFixed(2)}`)
  }

  return `M ${points.join(" L ")}`
})()

const spring = (value: number): Spring => ({ value, velocity: 0 })

/**
 * The animated eye. Its frame loop runs only while the panel tab is visible, and follows the pointer only while
 * idle. Each frame writes the SVG attributes directly: nothing re-renders.
 */
export function Eye(props: {
  readonly look: Look
  readonly size: number
  readonly palette: Palette
  readonly label: string
  /** A fixed pose to draw instead of animating, for previews. */
  readonly still?: Pose
}) {
  const panel = usePanel()
  const ids = { clip: createUniqueId(), iris: createUniqueId() }
  const calm = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches
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

  let key = ""
  let current: Behavior | undefined
  let born = 0

  const draw = (x: number, y: number, open: number, scale: number) => {
    const length = Math.hypot(x, y)
    const angle = (Math.atan2(y, x) * 180) / Math.PI
    // Foreshortening: the iris narrows along the direction it turns to.
    const squash = 1 - 0.16 * Math.min(1, length)
    const o = Math.max(0, Math.min(1.25, open))
    const top = -R - 4 + (1 - o) * (R + 6)
    const bottom = R + 4 - (1 - o) * (R + 2)

    iris?.setAttribute(
      "transform",
      `translate(${(x * TRAVEL).toFixed(2)} ${(y * TRAVEL).toFixed(2)}) rotate(${angle.toFixed(1)}) scale(${squash.toFixed(3)} 1) rotate(${(-angle).toFixed(1)})`,
    )
    pupilDot?.setAttribute("r", (PUPIL_R * Math.max(0.3, scale)).toFixed(2))
    upper?.setAttribute("d", `M -60 -60 H 60 V ${top} Q 0 ${top + UPPER_BULGE * 2} -60 ${top} Z`)
    lash?.setAttribute("d", `M -60 ${top} Q 0 ${top + UPPER_BULGE * 2} 60 ${top}`)
    lower?.setAttribute("d", `M -60 60 H 60 V ${bottom} Q 0 ${bottom - LOWER_BULGE * 2} -60 ${bottom} Z`)
  }

  createKeyed(
    () => props.still,
    (pose) => draw(pose.x, pose.y, pose.open, pose.pupil),
  )

  // Frame loop, while the tab shows.
  createKeyed(
    () => !props.still && panel.visible(),
    () => {
      let last = performance.now()
      let frame = 0

      const tick = (now: number) => {
        const look = props.look
        const next = lookKey(look)

        if (next !== key || !current) {
          key = next
          current = behavior(look, Math.random, calm)
          born = now
        }

        // A tab shown again after a while must not jump: cap the step.
        const dt = Math.min((now - last) / 1000, 1 / 30)
        last = now

        const target = current.target((now - born) / 1000, { pointer: look.mood === "idle" ? pointer : undefined })

        step(gaze.x, target.x, dt, GAZE)
        step(gaze.y, target.y, dt, GAZE)
        step(lid, target.open, dt, LID)
        step(pupil, target.pupil, dt, PUPIL)

        const g = clampDisc(gaze.x.value, gaze.y.value, 1.05)

        draw(g.x, g.y, lid.value, pupil.value)
        frame = requestAnimationFrame(tick)
      }

      frame = requestAnimationFrame(tick)
      onCleanup(() => cancelAnimationFrame(frame))
    },
  )

  // Pointer tracking, only while idle and visible. Moves are folded into one read per animation frame.
  createKeyed(
    () => !props.still && panel.visible() && props.look.mood === "idle",
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
      ref={(element) => {
        svg = element
        queueMicrotask(() => {
          const pose = props.still ?? REST

          draw(pose.x, pose.y, pose.open, pose.pupil)
        })
      }}
      class="opencode-eye__svg"
      classList={{ "opencode-eye__svg--stuck": !!props.look.stuck }}
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
      <circle r={R} fill={props.palette.sclera} />
      <g clip-path={`url(#${ids.clip})`}>
        <g ref={iris}>
          <circle
            r={IRIS}
            fill={`url(#${ids.iris})`}
            stroke={`color-mix(in srgb, ${props.palette.iris} 45%, black)`}
            stroke-width="1.2"
          />
          <circle ref={pupilDot} r={PUPIL_R} fill={props.palette.pupil} />
          <Show when={props.look.stuck}>
            <path class="opencode-eye__spiral" d={SPIRAL} fill="none" stroke={props.palette.sclera} stroke-width="1.6" />
          </Show>
          <circle cx="-5" cy="-6" r="3" fill="white" opacity="0.85" />
        </g>
        <path ref={upper} fill={props.palette.lid} />
        <path ref={lower} fill={props.palette.lid} />
        <path ref={lash} fill="none" stroke={props.palette.outline} stroke-width="2.4" stroke-linecap="round" />
      </g>
      <circle r={R} fill="none" stroke={props.palette.outline} stroke-width="2.5" />
      <Show when={props.look.mood === "sleeping"}>
        <g class="opencode-eye__zzz" fill={props.palette.outline}>
          <text x="30" y="-30">z</text>
          <text x="36" y="-38">z</text>
          <text x="42" y="-46">z</text>
        </g>
      </Show>
    </svg>
  )
}
