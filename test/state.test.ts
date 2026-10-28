import { describe, expect, test } from "bun:test"
import capture from "./fixtures/capture.json"
import {
  currentTool,
  deadline,
  FLASH_MS,
  HISTORY,
  initial,
  kindOf,
  reduce,
  reduceSessions,
  TICK,
  type EyeEvent,
  type EyeState,
  type Mood,
  type Sessions,
} from "../src/gui/state"

const S = "ses_a"

const ev = (type: string, data: Record<string, unknown> = {}): EyeEvent => ({ type, data: { sessionID: S, ...data } })

/** Plays events one millisecond apart from `start`, on one session. */
function play(events: readonly EyeEvent[], state = initial(0), start = 1): EyeState {
  return events.reduce((acc, event, index) => reduce(acc, event, start + index), state)
}

const started = play([ev("session.execution.started"), ev("session.step.started")])

describe("kindOf", () => {
  test("maps the tools seen in the capture", () => {
    expect(kindOf("read")).toBe("read")
    expect(kindOf("grep")).toBe("read")
    expect(kindOf("glob")).toBe("read")
    expect(kindOf("patch")).toBe("edit")
    expect(kindOf("shell")).toBe("shell")
    expect(kindOf("execute")).toBe("generic")
    expect(kindOf("subagent")).toBe("generic")
    expect(kindOf("question")).toBe("generic")
  })

  test("ignores case and falls back to generic", () => {
    expect(kindOf("Bash")).toBe("shell")
    expect(kindOf("tracker.get_issue")).toBe("generic")
    expect(kindOf("")).toBe("generic")
  })
})

describe("execution", () => {
  test("starts idle", () => {
    expect(initial(0).mood).toBe("idle")
  })

  test("thinks from the execution start", () => {
    expect(play([ev("session.execution.started")]).mood).toBe("thinking")
  })

  test("joins a run already going from its reasoning or text", () => {
    expect(play([ev("session.reasoning.started")]).mood).toBe("thinking")
    expect(play([ev("session.text.started")]).mood).toBe("thinking")
  })

  test("goes idle on success and on interruption", () => {
    expect(play([ev("session.execution.succeeded")], started).mood).toBe("idle")
    expect(play([ev("session.execution.interrupted", { reason: "user" })], started).mood).toBe("idle")
  })

  test("an interruption drops the tools and asks in flight", () => {
    const state = play(
      [
        ev("session.tool.input.started", { id: "c1", name: "shell" }),
        ev("permission.asked", { id: "p1", action: "shell" }),
        ev("session.execution.interrupted", { reason: "user" }),
      ],
      started,
    )

    expect(state.tools).toEqual([])
    expect(state.asks).toEqual([])
  })
})

describe("tools", () => {
  test("a tool shows from its input start, with its kind", () => {
    const state = play([ev("session.tool.input.started", { id: "c1", name: "patch" })], started)

    expect(state.mood).toBe("tool")
    expect(currentTool(state)).toMatchObject({ id: "c1", name: "patch", kind: "edit" })
  })

  test("called and progress keep the tool; success returns to thinking", () => {
    const state = play(
      [
        ev("session.tool.input.started", { id: "c1", name: "grep" }),
        ev("session.tool.input.ended", { id: "c1" }),
        ev("session.tool.called", { id: "c1" }),
        ev("session.tool.progress", { id: "c1" }),
      ],
      started,
    )

    expect(currentTool(state)?.name).toBe("grep")
    expect(play([ev("session.tool.success", { id: "c1" })], state).mood).toBe("thinking")
  })

  test("parallel tools show the latest started, then fall back as they end", () => {
    let state = play(
      [
        ev("session.tool.input.started", { id: "c1", name: "read" }),
        ev("session.tool.input.started", { id: "c2", name: "grep" }),
        ev("session.tool.input.started", { id: "c3", name: "shell" }),
      ],
      started,
    )

    expect(currentTool(state)?.name).toBe("shell")
    state = play([ev("session.tool.success", { id: "c3" })], state, 100)
    expect(currentTool(state)?.name).toBe("grep")
    // An older tool ending does not change what is shown.
    state = play([ev("session.tool.success", { id: "c1" })], state, 200)
    expect(currentTool(state)?.name).toBe("grep")
    state = play([ev("session.tool.success", { id: "c2" })], state, 300)
    expect(state.mood).toBe("thinking")
  })

  test("a tool called without its input start still shows, as generic", () => {
    const state = play([ev("session.tool.called", { id: "c9" })], started)

    expect(currentTool(state)).toMatchObject({ id: "c9", name: "", kind: "generic" })
  })

  test("a wrapper's progress names the inner tool it runs", () => {
    const state = play(
      [
        ev("session.tool.input.started", { id: "c1", name: "execute" }),
        ev("session.tool.progress", {
          id: "c1",
          metadata: {
            toolCalls: [
              { tool: "search", status: "completed" },
              { tool: "tracker.get_issue", status: "running" },
            ],
          },
        }),
      ],
      started,
    )

    expect(currentTool(state)).toMatchObject({ name: "execute", inner: "tracker.get_issue" })
  })

  test("a duplicate input start is ignored", () => {
    const once = play([ev("session.tool.input.started", { id: "c1", name: "read" })], started)

    expect(reduce(once, ev("session.tool.input.started", { id: "c1", name: "read" }), 50)).toBe(once)
  })
})

describe("errors", () => {
  test("a failed tool flashes, then the eye goes back to what it was doing", () => {
    const failed = play(
      [
        ev("session.tool.input.started", { id: "c1", name: "grep" }),
        ev("session.tool.failed", { id: "c1", error: { message: "Invalid ripgrep match output" } }),
      ],
      started,
    )
    const at = failed.error!.at

    expect(failed.mood).toBe("error")
    expect(failed.error).toMatchObject({ scope: "tool", message: "Invalid ripgrep match output" })
    expect(deadline(failed, at)).toBe(at + FLASH_MS)
    expect(reduce(failed, { type: TICK }, at + FLASH_MS - 1).mood).toBe("error")

    const after = reduce(failed, { type: TICK }, at + FLASH_MS)

    expect(after.mood).toBe("thinking")
    expect(after.error).toBeUndefined()
    expect(deadline(after, at + FLASH_MS)).toBeUndefined()
  })

  test("a failed execution stays until the next one starts", () => {
    const failed = play([ev("session.execution.failed", { error: { message: "rate limited" } })], started)

    expect(failed.mood).toBe("error")
    expect(failed.running).toBe(false)
    expect(deadline(failed, 10)).toBeUndefined()
    expect(reduce(failed, { type: TICK }, 1_000_000).mood).toBe("error")
    expect(play([ev("session.execution.started")], failed, 2_000_000).mood).toBe("thinking")
  })

  test("a failed step stays until the next step", () => {
    const failed = play([ev("session.step.failed", { error: { message: "overloaded" } })], started)

    expect(failed.mood).toBe("error")
    expect(play([ev("session.step.started")], failed, 100).mood).toBe("thinking")
  })

  test("a failed compaction wakes the eye into an error", () => {
    const failed = play(
      [ev("session.compaction.started"), ev("session.compaction.failed", { error: { message: "too long" } })],
      started,
    )

    expect(failed.mood).toBe("error")
    expect(failed.compacting).toBe(false)
  })
})

describe("asks", () => {
  test("a permission request outranks a tool, until it is answered", () => {
    const asking = play(
      [
        ev("session.tool.input.started", { id: "c1", name: "shell" }),
        ev("permission.asked", { id: "p1", action: "shell", resources: ["rm -rf build"] }),
      ],
      started,
    )

    expect(asking.mood).toBe("attention")
    expect(asking.asks).toMatchObject([{ id: "p1", kind: "permission", label: "shell" }])
    expect(play([ev("permission.replied", { requestID: "p1", reply: "once" })], asking, 100).mood).toBe("tool")
  })

  test("a question form asks like a permission", () => {
    const asking = play([ev("form.created", { form: { id: "f1", sessionID: S, title: "Which branch?" } })], started)

    expect(asking.mood).toBe("attention")
    expect(asking.asks).toMatchObject([{ id: "f1", kind: "question", label: "Which branch?" }])
    expect(play([ev("form.cancelled", { id: "f1" })], asking, 100).mood).toBe("thinking")
    expect(play([ev("form.replied", { id: "f1", answer: {} })], asking, 100).mood).toBe("thinking")
  })
})

describe("compaction", () => {
  test("sleeps while compacting, then idles when the execution ends", () => {
    const sleeping = play([ev("session.compaction.started", { reason: "manual" })], started)

    expect(sleeping.mood).toBe("sleeping")

    const awake = play([ev("session.compaction.ended", { reason: "manual" })], sleeping, 100)

    expect(awake.mood).toBe("thinking")
    expect(play([ev("session.execution.succeeded")], awake, 200).mood).toBe("idle")
  })
})

describe("history", () => {
  test("records each change of mood or shown tool, with its event", () => {
    const state = play([
      ev("session.execution.started"),
      ev("session.step.started"),
      ev("session.tool.input.started", { id: "c1", name: "read" }),
      ev("session.tool.input.started", { id: "c2", name: "grep" }),
      ev("session.tool.success", { id: "c2" }),
      ev("session.tool.success", { id: "c1" }),
      ev("session.execution.succeeded"),
    ])

    expect(state.history.map((item) => [item.mood, item.tool, item.event])).toEqual([
      ["thinking", undefined, "session.execution.started"],
      ["tool", "read", "session.tool.input.started"],
      ["tool", "grep", "session.tool.input.started"],
      ["tool", "read", "session.tool.success"],
      ["thinking", undefined, "session.tool.success"],
      ["idle", undefined, "session.execution.succeeded"],
    ])
    expect(state.since).toBe(7)
  })

  test("keeps the latest transitions only", () => {
    const events = Array.from({ length: HISTORY + 10 }, (_, i) => [
      ev("session.tool.input.started", { id: `c${i}`, name: "read" }),
      ev("session.tool.success", { id: `c${i}` }),
    ]).flat()
    const state = play(events, started)

    expect(state.history).toHaveLength(HISTORY)
    expect(state.history.at(-1)?.mood).toBe("thinking")
  })

  test("an event that changes nothing returns the same state", () => {
    expect(reduce(started, ev("session.step.ended", { finish: "tool-calls" }), 50)).toBe(started)
    expect(reduce(started, { type: TICK }, 50)).toBe(started)
  })
})

describe("reduceSessions", () => {
  test("keeps each session apart", () => {
    let sessions: Sessions = {}

    sessions = reduceSessions(sessions, ev("session.execution.started"), 1)
    sessions = reduceSessions(
      sessions,
      { type: "session.tool.input.started", data: { sessionID: "ses_b", id: "c1", name: "shell" } },
      2,
    )

    expect(sessions[S]?.mood).toBe("thinking")
    expect(sessions.ses_b?.mood).toBe("tool")
  })

  test("reads a form's session from the form", () => {
    const sessions = reduceSessions({}, { type: "form.created", data: { form: { id: "f1", sessionID: "ses_c" } } }, 1)

    expect(sessions.ses_c?.mood).toBe("attention")
  })

  test("ignores events without a session, and keeps identity when nothing changes", () => {
    const sessions = reduceSessions({}, ev("session.execution.started"), 1)

    expect(reduceSessions(sessions, { type: "shell.created", data: { info: {} } }, 2)).toBe(sessions)
    expect(reduceSessions(sessions, { type: "server.connected", data: {} }, 2)).toBe(sessions)
    expect(reduceSessions(sessions, ev("session.step.ended"), 2)).toBe(sessions)
    expect(reduceSessions(sessions, { type: TICK }, 2)).toBe(sessions)
  })

  test("ticks expire flashes in every session", () => {
    let sessions = reduceSessions({}, ev("session.execution.started"), 0)

    sessions = reduceSessions(sessions, ev("session.tool.input.started", { id: "c1", name: "grep" }), 1)
    sessions = reduceSessions(sessions, ev("session.tool.failed", { id: "c1" }), 2)
    expect(sessions[S]?.mood).toBe("error")
    expect(reduceSessions(sessions, { type: TICK }, 2 + FLASH_MS)[S]?.mood).toBe("thinking")
  })

  test("forgets a deleted session", () => {
    const sessions = reduceSessions({}, ev("session.execution.started"), 1)

    expect(reduceSessions(sessions, ev("session.deleted"), 2)).toEqual({})
  })
})

describe("captured run", () => {
  // Real events from OpenCode Desktop 2.2.0, anonymized: two sessions, 22 tools, a grep failure and a /compact.
  const events = capture as readonly (EyeEvent & { t: number })[]

  test("replays to idle with no tool left in flight", () => {
    const moods = new Map<string, Set<Mood>>()
    const final = events.reduce<Sessions>((sessions, event) => {
      const next = reduceSessions(sessions, event, event.t)

      for (const [id, state] of Object.entries(next)) {
        if (!moods.has(id)) moods.set(id, new Set())
        moods.get(id)!.add(state.mood)
      }
      return next
    }, {})

    expect(Object.keys(final).sort()).toEqual(["ses_a", "ses_b"])
    for (const state of Object.values(final)) {
      expect(state.mood).toBe("idle")
      expect(state.tools).toEqual([])
    }
    expect([...moods.get("ses_a")!].sort()).toEqual(["error", "idle", "thinking", "tool"])
    expect([...moods.get("ses_b")!].sort()).toEqual(["idle", "sleeping", "thinking", "tool"])
  })

  test("shows every tool kind of the run", () => {
    const kinds = new Set<string>()

    events.reduce<Sessions>((sessions, event) => {
      const next = reduceSessions(sessions, event, event.t)

      for (const state of Object.values(next)) {
        const tool = currentTool(state)

        if (tool) kinds.add(tool.kind)
      }
      return next
    }, {})

    expect([...kinds].sort()).toEqual(["edit", "generic", "read", "shell"])
  })
})
