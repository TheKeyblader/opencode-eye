import { isToolState, type EyeState, type EyeView, type Transition } from "./machine"

type Translate = (key: string, params?: Record<string, string | number | boolean>) => string

/** A state, with its tool for the tool states: `Reading · grep`. */
export function stateLabel(t: Translate, state: EyeState, tool?: string): string {
  const label = t(`state.${state}`)

  return isToolState(state) && tool ? `${label} · ${tool}` : label
}

/** What the eye shows, in one line, with its modifiers: `Reading · grep · taking a while`, `Bored`. */
export function viewLabel(t: Translate, view: EyeView): string {
  if (view.state === "idle" && view.mods.bored) return t("state.bored")
  const label = stateLabel(t, view.state, view.tool?.name)

  return view.mods.impatient && view.tool ? `${label} · ${t("state.impatient")}` : label
}

export const transitionLabel = (t: Translate, item: Transition) => stateLabel(t, item.state, item.tool)

/** The states a screen reader hears: attention, the errors and the end of a run. Not every tool. */
export function announced(state: EyeState): boolean {
  return (
    state === "attention" ||
    state === "error-flash" ||
    state === "error" ||
    state === "error-spiral" ||
    state === "happy" ||
    state === "vexed"
  )
}

/** The status dot: lit while at work, red on an error, blinking while waiting for the user. */
export function statusDot(state: EyeState): "" | "on" | "err" | "att" {
  if (state === "attention") return "att"
  if (state === "error-flash" || state === "error" || state === "error-spiral") return "err"
  if (state === "idle" || state === "sleep" || state === "happy" || state === "vexed" || state === "surprised")
    return ""
  return "on"
}

/** A short duration: `< 1 s`, `42 s`, `3 min 05 s`, `1 h 02 min`. */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(Math.max(0, ms) / 1000)

  if (seconds < 1) return "< 1 s"
  if (seconds < 60) return `${seconds} s`

  const minutes = Math.floor(seconds / 60)

  if (minutes < 60) return `${minutes} min ${String(seconds % 60).padStart(2, "0")} s`
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`
}
