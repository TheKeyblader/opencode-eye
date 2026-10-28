import type { Mood, RunningTool, EyeState } from "./state"
import { currentTool } from "./state"

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
