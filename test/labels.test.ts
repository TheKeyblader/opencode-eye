import { describe, expect, test } from "bun:test"
import { formatDuration, moodLabel, stateLabel, toolName, transitionLabel } from "../src/gui/labels"
import { initial } from "../src/gui/state"

// Echoes the key and its params, so tests read which copy was asked for.
const t = (key: string, params?: Record<string, string | number | boolean>) =>
  params ? `${key}(${Object.values(params).join(",")})` : key

describe("formatDuration", () => {
  test("picks the unit by size", () => {
    expect(formatDuration(-5)).toBe("< 1 s")
    expect(formatDuration(999)).toBe("< 1 s")
    expect(formatDuration(42_000)).toBe("42 s")
    expect(formatDuration(185_000)).toBe("3 min 05 s")
    expect(formatDuration(3_720_000)).toBe("1 h 02 min")
  })
})

describe("labels", () => {
  test("a tool reads as its kind's verb and its name", () => {
    expect(moodLabel(t, "tool", { id: "c1", name: "grep", kind: "read", since: 0 })).toBe("tool.read · grep")
    expect(moodLabel(t, "tool", { id: "c1", name: "", kind: "generic", since: 0 })).toBe("tool.generic")
    expect(moodLabel(t, "thinking")).toBe("mood.thinking")
  })

  test("a wrapper shows its inner tool", () => {
    expect(toolName({ id: "c1", name: "execute", kind: "generic", since: 0, inner: "tracker.get_issue" })).toBe(
      "execute → tracker.get_issue",
    )
  })

  test("a state reads as its mood and shown tool", () => {
    const state = {
      ...initial(0),
      mood: "tool" as const,
      tools: [{ id: "c1", name: "shell", kind: "shell" as const, since: 0 }],
    }

    expect(stateLabel(t, state)).toBe("tool.shell · shell")
    expect(stateLabel(t, initial(0))).toBe("mood.idle")
  })

  test("a past tool transition gets its kind back from its name", () => {
    expect(transitionLabel(t, { at: 0, mood: "tool", tool: "patch", event: "session.tool.input.started" })).toBe(
      "tool.edit · patch",
    )
    expect(transitionLabel(t, { at: 0, mood: "sleeping", event: "session.compaction.started" })).toBe("mood.sleeping")
  })
})
