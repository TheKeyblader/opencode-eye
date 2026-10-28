import { describe, expect, test } from "bun:test"
import { seed, type SeedSource } from "../src/gui/seed"
import { EyeStateMachine } from "../src/gui/machine"

const IDLE: SeedSource = { status: "idle", messages: [], permissions: [], forms: [] }

const tool = (id: string, name: string, status: string) => ({
  type: "tool",
  id,
  name,
  state: { status },
  time: { created: 0 },
})
const assistant = (...content: unknown[]) => ({ type: "assistant", id: "msg_1", content })

describe("seed", () => {
  test("reads what the latest answer put in the context", () => {
    const tokens = { input: 100, output: 20, reasoning: 0, cache: { read: 0, write: 0 } }
    const messages = [
      { type: "assistant", id: "msg_1", content: [], tokens: { ...tokens, input: 50 } },
      { type: "assistant", id: "msg_2", content: [], tokens },
      { type: "assistant", id: "msg_3", content: [] },
    ]

    expect(seed("ses_a", { ...IDLE, messages }).usage).toEqual({ messageID: "msg_2", tokens: 120 })
  })

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

describe("a seeded eye", () => {
  test("joins mid-run on the tool in flight, not at rest", () => {
    const view = new EyeStateMachine({}, 0).seed(
      seed("ses_a", { ...IDLE, status: "running", messages: [assistant(tool("c1", "shell", "running"))] }),
      5,
    )

    expect(view.state).toBe("shell")
    expect(view.tool?.name).toBe("shell")
  })

  test("a running session with no tool in flight thinks", () => {
    expect(new EyeStateMachine({}, 0).seed(seed("ses_a", { ...IDLE, status: "running" }), 5).state).toBe("think")
  })

  test("then the events take over", () => {
    const machine = new EyeStateMachine({}, 0)

    machine.seed(
      seed("ses_a", { ...IDLE, status: "running", messages: [assistant(tool("c1", "shell", "running"))] }),
      5,
    )
    machine.dispatch({ type: "tool.success", callId: "c1" }, 1000)
    expect(machine.tick(1300).state).toBe("think")
    expect(machine.dispatch({ type: "execution.succeeded" }, 2000).state).toBe("happy")
  })
})
