import { describe, expect, test } from "bun:test"
import { seed, type SeedSource } from "../src/gui/seed"
import { currentTool, initial, reduce, reduceSessions, SEED, type EyeEvent } from "../src/gui/state"

const IDLE: SeedSource = { status: "idle", messages: [], permissions: [], forms: [] }

const tool = (id: string, name: string, status: string) => ({
  type: "tool",
  id,
  name,
  state: { status },
  time: { created: 0 },
})
const assistant = (...content: unknown[]) => ({ type: "assistant", id: "msg_1", content })

const seedEvent = (source: SeedSource): EyeEvent => ({ type: SEED, data: seed("ses_a", source) })

describe("seed", () => {
  test("lists the tools in flight of a running session", () => {
    const out = seed("ses_a", {
      ...IDLE,
      status: "running",
      messages: [
        { type: "user", id: "msg_0" },
        assistant(tool("c1", "read", "completed"), tool("c2", "grep", "running"), tool("c3", "patch", "streaming")),
      ],
    })

    expect(out.running).toBe(true)
    expect(out.tools).toEqual([
      { id: "c2", name: "grep" },
      { id: "c3", name: "patch" },
    ])
  })

  test("ignores parts left running by a run that is over", () => {
    expect(seed("ses_a", { ...IDLE, messages: [assistant(tool("c1", "shell", "running"))] }).tools).toEqual([])
  })

  test("sees a compaction in progress", () => {
    const messages = [{ type: "compaction", id: "msg_2", status: "running", reason: "manual" }]

    expect(seed("ses_a", { ...IDLE, status: "running", messages }).compacting).toBe(true)
  })

  test("lists pending approvals and questions", () => {
    const out = seed("ses_a", {
      ...IDLE,
      permissions: [{ id: "per_1", action: "shell" }],
      forms: [{ id: "frm_1", title: "Questions" }],
    })

    expect(out.asks).toEqual([
      { id: "per_1", kind: "permission", label: "shell" },
      { id: "frm_1", kind: "question", label: "Questions" },
    ])
  })
})

describe("the eye.seed event", () => {
  test("an eye that joins mid-run shows the tool in flight, not rest", () => {
    const state = reduce(
      initial(0),
      seedEvent({ ...IDLE, status: "running", messages: [assistant(tool("c1", "shell", "running"))] }),
      5,
    )

    expect(state.mood).toBe("tool")
    expect(currentTool(state)).toMatchObject({ id: "c1", name: "shell", kind: "shell" })
  })

  test("a running session with no tool in flight thinks", () => {
    expect(reduce(initial(0), seedEvent({ ...IDLE, status: "running" }), 5).mood).toBe("thinking")
  })

  test("a pending approval stares", () => {
    const state = reduce(initial(0), seedEvent({ ...IDLE, permissions: [{ id: "per_1", action: "shell" }] }), 5)

    expect(state.mood).toBe("attention")
  })

  test("an idle session stays as it is", () => {
    const state = initial(0)

    expect(reduce(state, seedEvent(IDLE), 5)).toBe(state)
  })

  test("the events then take over: the tool ends and the run ends", () => {
    let state = reduce(
      initial(0),
      seedEvent({ ...IDLE, status: "running", messages: [assistant(tool("c1", "shell", "running"))] }),
      5,
    )

    state = reduce(state, { type: "session.tool.success", data: { sessionID: "ses_a", id: "c1" } }, 6)
    expect(state.mood).toBe("thinking")
    state = reduce(state, { type: "session.execution.succeeded", data: { sessionID: "ses_a" } }, 7)
    expect(state.mood).toBe("idle")
  })

  test("a second seed only adds what loaded since, such as approvals", () => {
    const first = reduce(initial(0), seedEvent({ ...IDLE, status: "running" }), 5)
    const second = reduce(
      first,
      seedEvent({ ...IDLE, status: "running", permissions: [{ id: "per_1", action: "shell" }] }),
      6,
    )

    expect(second.mood).toBe("attention")
    expect(second.asks).toHaveLength(1)
    expect(reduce(second, seedEvent({ ...IDLE, status: "running", permissions: [{ id: "per_1", action: "shell" }] }), 7)).toBe(
      second,
    )
  })

  test("once the eye saw a transition of its own, a seed changes nothing", () => {
    const seen = reduce(initial(0), { type: "session.execution.succeeded", data: { sessionID: "ses_a" } }, 1)
    const known = reduce(seen, { type: "session.execution.started", data: { sessionID: "ses_a" } }, 2)
    const ended = reduce(known, { type: "session.execution.succeeded", data: { sessionID: "ses_a" } }, 3)

    // The snapshot was taken before the end reached the server data: it must not bring the run back.
    expect(reduce(ended, seedEvent({ ...IDLE, status: "running" }), 4)).toBe(ended)
  })

  test("reaches the right session through reduceSessions", () => {
    const sessions = reduceSessions({}, seedEvent({ ...IDLE, status: "running" }), 5)

    expect(sessions.ses_a?.mood).toBe("thinking")
  })
})
