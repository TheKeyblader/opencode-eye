import { createUniqueId, For, onCleanup, Show, type JSX } from "solid-js"
import { createKeyed } from "@opencode/plugin/gui"
import { createEyeEngine, spiralPath, type Engine } from "./engine"
import type { EyeState, Mods } from "./machine"
import { COMPACT, strokeWidth, type Colors, type Stroke } from "./palette"

/** The eye's inputs: what it shows and how it looks. */
export interface EyeProps {
  readonly state: EyeState
  /** Whether a tool is shown: the hourglass of `impatient` only shows with one. */
  readonly tool: boolean
  readonly mods: Mods
  /** The eye's width, in px. */
  readonly size: number
  readonly theme: "light" | "dark"
  readonly brow: boolean
  readonly stroke: Stroke
  readonly colors: Colors
  readonly reduced: boolean
  /** The frame loop runs only while this is true. */
  readonly visible: () => boolean
  /** The eye is a button with this label when there is `onClick`; else a picture. */
  readonly label?: string
  readonly onClick?: (engine: Engine) => void
  /** Top right of the eye. */
  readonly badge?: JSX.Element
  /** Under the eye and its scene. */
  readonly children?: JSX.Element
  /** A still picture `still` ms into the state, without the frame loop (screenshots). */
  readonly still?: number
}

const SPIRAL = spiralPath()
const TICKS = [-44, -22, 0, 22, 44]
const STAR = "M 0 -9 Q 1.6 -1.6 9 0 Q 1.6 1.6 0 9 Q -1.6 1.6 -9 0 Q -1.6 -1.6 0 -9 Z"
const STARS = ["translate(190 100)", "translate(55 178)", "translate(55 22)"]
const CONFETTI: readonly (readonly [x: number, y: number, delay: string])[] = [
  [34, -34, "0s"],
  [56, -48, ".08s"],
  [78, -28, ".03s"],
  [96, -52, ".12s"],
  [112, -36, ".05s"],
  [130, -46, ".15s"],
  [148, -30, ".02s"],
  [166, -50, ".1s"],
  [46, -20, ".18s"],
  [138, -22, ".2s"],
]
// The sheet: each line's y, its text's end, and its written stroke's end.
const LINES: readonly (readonly [y: number, text: number, written: number])[] = [
  [32, 136, 134],
  [50, 138, 138],
  [68, 124, 120],
  [86, 104, 96],
]
// The terminal: 3 lengths repeated, so the scroll loops unseen.
const TERMINAL = [140, 118, 130, 140, 118, 130, 140, 118, 130]
const CHECKS: readonly (readonly [y: number, end: number])[] = [
  [19, 138],
  [41, 124],
  [63, 132],
  [85, 110],
]

/**
 * The eye, its scene and its badge, from `reference/eye.html`. `data-state` drives the CSS; the engine writes the
 * motion as CSS variables.
 */
export function Eye(props: EyeProps) {
  const uid = createUniqueId()
  let eye!: SVGSVGElement
  let stage!: SVGSVGElement

  const picture = (
    <svg
      ref={eye}
      class="eye"
      data-state={props.state}
      data-tool={props.tool ? "yes" : "no"}
      viewBox="0 -30 200 230"
      style={{ width: `${props.size}px`, height: `${props.size * 1.15}px` }}
      aria-hidden="true"
    >
      <defs>
        <clipPath id={`ring-${uid}`}>
          <circle cx="100" cy="100" r="72" />
        </clipPath>
      </defs>

      <g class="body">
        <circle class="halo" cx="100" cy="100" r="72" />

        <g class="brow-g">
          <path class="brow" d="M 64 -6 Q 100 -20 136 -6" />
        </g>

        {/* Everything that follows the lid (scaleY) */}
        <g class="lids">
          <g class="ticks">
            <For each={TICKS}>
              {(angle) => (
                <line
                  class="tick"
                  x1="100"
                  y1="19"
                  x2="100"
                  y2="8"
                  transform={angle ? `rotate(${angle} 100 100)` : undefined}
                />
              )}
            </For>
          </g>
          <circle class="ring" cx="100" cy="100" r="72" />
          <g clip-path={`url(#ring-${uid})`}>
            <g class="look">
              <g class="pupil">
                <circle class="pup" cx="100" cy="100" r="17" />
              </g>
            </g>
            <g class="spiral-g">
              <path class="spiral" d={SPIRAL} />
            </g>
          </g>
        </g>

        <path class="smile" d="M 46 112 Q 100 48 154 112" />

        <g>
          <text class="zz z1" x="150" y="26">
            z
          </text>
          <text class="zz z2" x="150" y="26">
            z
          </text>
          <text class="zz z3" x="150" y="26">
            Z
          </text>
        </g>
      </g>

      <g class="stars">
        <For each={STARS}>{(transform) => <path class="star" transform={transform} d={STAR} />}</For>
      </g>

      <g class="confetti">
        <For each={CONFETTI}>
          {([x, y, delay]) => (
            <rect class="cf" x={x} y={y} width="3.5" height="9" style={{ "animation-delay": delay }} />
          )}
        </For>
      </g>

      <g class="hourglass" transform="translate(16 4)">
        <g class="hg">
          <path class="hg-l" d="M -7 -10 H 7 M -7 10 H 7 M -5.5 -10 L 0 0 L -5.5 10 M 5.5 -10 L 0 0 L 5.5 10" />
          <path class="hg-s" d="M -3 8.5 L 0 4 L 3 8.5 Z" />
        </g>
      </g>

      <g class="coffee" transform="translate(18 170)">
        <path class="cup" d="M -10 -4 H 8 V 4 Q 8 12 -1 12 Q -10 12 -10 4 Z" />
        <path class="cup-h" d="M 8 -1 Q 14 -1 14 3 Q 14 7 8 7" />
        <path class="steam" d="M -5 -8 q -3 -4 0 -8 q 3 -4 0 -8" />
        <path class="steam s2" d="M 2 -8 q -3 -4 0 -8 q 3 -4 0 -8" />
      </g>

      {/* think: the thought bubble, flipped by --bub-s with the gaze's side */}
      <g class="bubble">
        <circle class="bub-part b1" cx="146" cy="6" r="3.5" />
        <circle class="bub-part b2" cx="158" cy="-10" r="5.5" />
        <ellipse class="bub-part b3" cx="174" cy="-42" rx="32" ry="21" />
        <circle class="bdot d1" cx="162" cy="-42" r="3.5" />
        <circle class="bdot d2" cx="174" cy="-42" r="3.5" />
        <circle class="bdot d3" cx="186" cy="-42" r="3.5" />
      </g>
    </svg>
  ) as SVGSVGElement

  const scene = (
    <svg
      ref={stage}
      class="stage"
      data-state={props.state}
      viewBox="0 0 200 120"
      style={{ width: `${props.size}px`, height: `${props.size * 0.6}px` }}
      aria-hidden="true"
    >
      <defs>
        <clipPath id={`term-${uid}`}>
          <rect x="46" y="28" width="108" height="58" />
        </clipPath>
      </defs>

      {/* read / write: sheet, magnifier, pencil */}
      <g class="paper-g">
        <path class="paper" d="M 52 10 H 136 L 150 24 V 112 H 52 Z" />
        <path class="fold" d="M 136 10 V 24 H 150" />
        <g>
          <For each={LINES}>{([y, end]) => <line class="txt" x1="64" y1={y} x2={end} y2={y} />}</For>
        </g>
        <g>
          <For each={LINES}>
            {([y, , end], index) => {
              const length = end - 64

              return (
                <line
                  class="wline"
                  x1="64"
                  y1={y}
                  x2={end}
                  y2={y}
                  style={{
                    "stroke-dasharray": `${length} ${length}`,
                    "stroke-dashoffset": `calc(var(--w${index()}, 1) * ${length}px)`,
                  }}
                />
              )
            }}
          </For>
        </g>
        <g class="loupe-g">
          <line class="handle" x1="9" y1="9" x2="19" y2="19" />
          <circle class="lens" cx="0" cy="0" r="12" />
        </g>
        <g class="pen-g">
          <path class="pen" d="M 0 0 L 3 -9 L 23 -29 L 29 -23 L 9 -3 Z" />
          <path class="pen" d="M 19 -33 L 25 -39 L 33 -31 L 27 -25" />
          <path class="pen-tip" d="M 0 0 L 1.6 -4.6 L 4.6 -1.6 Z" />
        </g>
      </g>

      {/* shell: terminal */}
      <g class="prop p-term">
        <rect class="ln bgf" x="44" y="12" width="112" height="96" rx="6" />
        <line class="ln" x1="44" y1="26" x2="156" y2="26" />
        <circle class="fillc" cx="53" cy="19" r="2" />
        <circle class="fillc" cx="61" cy="19" r="2" />
        <circle class="fillc" cx="69" cy="19" r="2" />
        <g clip-path={`url(#term-${uid})`}>
          <g class="t-scroll">
            <For each={TERMINAL}>
              {(end, index) => {
                const y = 40 + 18 * index()

                return (
                  <>
                    <path class="ln mut" d={`M 52 ${y - 4} l 4 4 l -4 4`} />
                    <line class="ln mut" x1="62" y1={y} x2={end} y2={y} />
                  </>
                )
              }}
            </For>
          </g>
        </g>
        <path class="ln" d="M 52 94 l 4 4 l -4 4" />
        <rect class="t-cur" x="62" y="93" width="7" height="10" />
      </g>

      {/* generic: puzzle piece */}
      <g class="prop p-puzzle">
        <g class="pz-pos">
          <g class="pz">
            <path class="ln bgf" d="M -12 -12 H -3 A 4 4 0 1 1 3 -12 H 12 V -3 A 4 4 0 1 1 12 3 V 12 H -12 Z" />
          </g>
        </g>
      </g>

      {/* delegate: mini eye */}
      <g class="prop p-mini">
        <g class="mini-pos">
          <line class="ln" x1="0" y1="-25" x2="0" y2="-30" transform="rotate(-32)" />
          <line class="ln" x1="0" y1="-25" x2="0" y2="-30" />
          <line class="ln" x1="0" y1="-25" x2="0" y2="-30" transform="rotate(32)" />
          <circle class="ln bgf" cx="0" cy="0" r="20" />
          <g class="mini-look">
            <circle class="mini-pup" cx="0" cy="0" r="7" />
          </g>
        </g>
      </g>

      {/* web: globe */}
      <g class="prop p-globe">
        <circle class="ln bgf" cx="100" cy="58" r="32" />
        <line class="ln" x1="68" y1="58" x2="132" y2="58" />
        <path class="ln" d="M 73 42 Q 100 48 127 42" />
        <path class="ln" d="M 73 74 Q 100 80 127 74" />
        <ellipse class="ln g-mer" cx="100" cy="58" rx="32" ry="32" />
        <ellipse class="ln g-mer m2" cx="100" cy="58" rx="32" ry="32" />
      </g>

      {/* plan: checklist */}
      <g class="prop p-plan">
        <rect class="ln bgf" x="48" y="8" width="104" height="104" rx="6" />
        <For each={CHECKS}>
          {([y, end]) => (
            <>
              <rect class="ln" x="58" y={y} width="14" height="14" rx="3" />
              <line class="ln mut" x1="82" y1={y + 7} x2={end} y2={y + 7} />
            </>
          )}
        </For>
        <For each={CHECKS}>
          {([y], index) => (
            <path
              class="ln"
              d={`M 61 ${y + 7} L 64.5 ${y + 10.5} L 70 ${y + 3.5}`}
              style={{
                "stroke-dasharray": "14 14",
                "stroke-dashoffset": `calc((1 - var(--c${index()}, 0)) * 14px)`,
              }}
            />
          )}
        </For>
      </g>

      {/* respond: speech bubble */}
      <g class="prop p-speech">
        <rect class="ln bgf" x="48" y="18" width="104" height="64" rx="14" />
        <path class="bgf" d="M 91 20.5 L 100 6 L 109 20.5 Z" />
        <path class="ln" d="M 92 19 L 100 6 L 108 19" />
        <line class="ln sp sp1" x1="64" y1="38" x2="136" y2="38" />
        <line class="ln sp sp2" x1="64" y1="52" x2="128" y2="52" />
        <line class="ln sp sp3" x1="64" y1="66" x2="106" y2="66" />
      </g>

      {/* attention: a hanging "?" */}
      <g class="prop p-ask">
        <g class="ask-swing">
          <line class="ln" x1="100" y1="2" x2="100" y2="22" />
          <circle class="ln bgf" cx="100" cy="42" r="20" />
          <path class="ln" d="M 93 36 Q 93 28 100 28 Q 107 28 107 35 Q 107 40 100 43 V 47" />
          <circle class="fillc" cx="100" cy="54" r="2.4" />
        </g>
      </g>

      {/* sleep: pillow */}
      <g class="prop p-pillow">
        <g class="pill">
          <path
            class="ln bgf"
            d="M 44 26 Q 46 10 66 14 Q 100 6 134 14 Q 154 10 156 26 Q 162 44 156 62 Q 154 78 134 74 Q 100 82 66 74 Q 46 78 44 62 Q 38 44 44 26 Z"
          />
          <path class="ln mut" d="M 60 24 Q 64 30 60 34" />
          <path class="ln mut" d="M 140 24 Q 136 30 140 34" />
        </g>
      </g>
    </svg>
  ) as SVGSVGElement

  const engine = createEyeEngine({
    eye,
    stage,
    getInput: () => ({ state: props.state, mods: props.mods, reduced: props.reduced }),
  })

  // The loop runs while the eye is on screen; it pauses by itself while the document is hidden.
  createKeyed(
    () => props.still === undefined && props.visible(),
    () => {
      engine.start()
      onCleanup(() => engine.stop())
    },
  )

  // A still picture: the frames of the first `still` ms of the state, at once.
  let clock = 0

  createKeyed(
    () => (props.still === undefined ? undefined : { state: props.state, still: props.still }),
    ({ still }) => {
      const start = (clock += 60_000)

      for (let t = 0; t <= still; t += 16.667) engine.step(start + t)
    },
    { equals: (a, b) => a.state === b.state && a.still === b.still },
  )

  return (
    <div
      class="opencode-eye-root"
      data-theme={props.theme}
      data-brow={props.brow ? "on" : "off"}
      data-reduced={props.reduced ? "on" : "off"}
      data-impatient={props.mods.impatient ? "on" : "off"}
      data-tired={props.mods.tired ? "on" : "off"}
      data-compact={props.size < COMPACT ? "on" : "off"}
      style={{
        "--stroke-w": String(strokeWidth(props.stroke)),
        "--contour": props.colors.contour || undefined,
        "--err": props.colors.error || undefined,
      }}
    >
      <div class="eye-wrap" style={{ width: `${props.size}px` }}>
        <Show when={props.onClick} fallback={<div class="eye-btn">{picture}</div>}>
          {(onClick) => (
            <button type="button" class="eye-btn" aria-label={props.label} onClick={() => onClick()(engine)}>
              {picture}
            </button>
          )}
        </Show>
        {props.badge}
        {scene}
      </div>
      {props.children}
    </div>
  )
}
