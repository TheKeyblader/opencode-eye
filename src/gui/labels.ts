import { currentTool, kindOf, type EyeState, type Mood, type RunningTool, type Transition } from "./state"

type Translate = (key: string, params?: Record<string, string | number | boolean>) => string

/** A tool's name as the user reads it: `execute → tracker.get_issue` for a wrapper. */
export function toolName(tool: RunningTool): string {
  return tool.inner ? `${tool.name} → ${tool.inner}` : tool.name
}

export function moodLabel(t: Translate, mood: Mood, tool?: RunningTool): string {
  if (mood !== "tool") return t(`mood.${mood}`)
  const verb = t(`tool.${tool?.kind ?? "generic"}`)
  const name = tool ? toolName(tool) : ""

  return name ? `${verb} · ${name}` : verb
}

/** What the eye is doing, in one line. */
export function stateLabel(t: Translate, state: EyeState): string {
  return moodLabel(t, state.mood, currentTool(state))
}

/** A past transition, in one line. */
export function transitionLabel(t: Translate, item: Transition): string {
  if (item.mood !== "tool") return t(`mood.${item.mood}`)
  const name = item.tool ?? ""

  return moodLabel(t, "tool", { id: "", name, kind: kindOf(name), since: item.at })
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
