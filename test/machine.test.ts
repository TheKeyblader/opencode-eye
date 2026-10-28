import { describe, expect, test } from "bun:test"
import { classifyTool, EyeStateMachine, sameView, SEED, type EyeEvent, type EyeView } from "../src/gui/machine"

/** A machine and a clock: `at(ms, event)` dispatches at that time, `tick(ms)` ticks then. */
function eye() {
  const machine = new EyeStateMachine({}, 0)

  return {
    machine,
    at: (ms: number, event: EyeEvent): EyeView => machine.dispatch(event, ms),
    tick: (ms: number): EyeView => machine.tick(ms),
  }
}

const tool = (callId: string, name: string): EyeEvent => ({ type: "tool.input.started", callId, tool: name })

describe("classifyTool", () => {
  test("sorts the tools of the spec, and the rest is generic", () => {
    expect(classifyTool("grep")).toBe("read")
    expect(classifyTool("apply_patch")).toBe("write")
    expect(classifyTool("Bash")).toBe("shell")
    expect(classifyTool("subagent")).toBe("delegate")
    expect(classifyTool("webfetch")).toBe("web")
    expect(classifyTool("todowrite")).toBe("plan")
    expect(classifyTool("tracker.get_issue")).toBe("generic")
  })
})

describe("priorities", () => {
  test("starts at rest", () => {
    expect(eye().tick(0).state).toBe("idle")
  })

  test("a run thinks, then responds", () => {
    const { at } = eye()

    expect(at(0, { type: "execution.started" }).state).toBe("think")
    expect(at(500, { type: "text.started" }).state).toBe("respond")
  })

  test("a pending approval beats everything, and the eye goes back after the reply", () => {
    const { at, machine } = eye()

    at(0, { type: "execution.started" })
    at(500, tool("c1", "shell"))
    expect(at(1000, { type: "permission.asked", id: "per_1" }).state).toBe("attention")
    expect(at(1100, { type: "permission.replied", id: "per_1" }).state).toBe("attention") // 400 ms first
    expect(machine.tick(1400).state).toBe("shell")
  })

  test("a question waits like an approval", () => {
    const { at } = eye()

    expect(at(0, { type: "form.created", id: "frm_1" }).state).toBe("attention")
    expect(at(2000, { type: "form.cancelled", id: "frm_1" }).state).toBe("idle")
  })

  test("compaction sleeps, under attention", () => {
    const { at } = eye()

    expect(at(0, { type: "compaction.started" }).state).toBe("sleep")
    expect(at(10, { type: "permission.asked", id: "per_1" }).state).toBe("attention")
    expect(at(20, { type: "permission.replied", id: "per_1" }).state).toBe("sleep")
    expect(at(3000, { type: "compaction.ended" }).state).toBe("idle")
  })
})

describe("tools", () => {
  test("parallel tools show the most intense one and count them all", () => {
    const { at } = eye()

    at(0, tool("c1", "read"))
    const view = at(10, tool("c2", "patch"))

    expect(view.state).toBe("read") // the first one still holds its 400 ms
    const later = at(500, tool("c3", "grep"))

    expect(later.state).toBe("write")
    expect(later.tool?.name).toBe("patch")
    expect(later.count).toBe(3)
  })

  test("execute shows the tool it calls inside", () => {
    const { at } = eye()

    at(0, tool("c1", "execute"))
    const view = at(500, { type: "tool.called", callId: "c1", tool: "execute", innerTool: "tracker.get_issue" })

    expect(view.state).toBe("generic")
    expect(view.tool?.name).toBe("tracker.get_issue")
    expect(at(1000, { type: "tool.called", callId: "c1", tool: "execute", innerTool: "read" }).state).toBe("read")
  })

  test("a tool whose start the eye missed is generic, with its name", () => {
    const view = eye().at(0, { type: "tool.called", callId: "c1", tool: "grep" })

    expect(view.state).toBe("generic")
    expect(view.tool?.name).toBe("grep")
  })

  test("tools chained within 250 ms never go through thinking", () => {
    const { at, tick } = eye()

    at(0, { type: "execution.started" })
    at(500, tool("c1", "read"))
    at(1000, { type: "tool.success", callId: "c1" })
    expect(tick(1100).state).toBe("read")
    expect(at(1200, tool("c2", "grep")).tool?.callId).toBe("c2")
  })

  test("after 250 ms without a tool, the eye thinks", () => {
    const { at, tick } = eye()

    at(0, { type: "execution.started" })
    at(500, tool("c1", "read"))
    at(1000, { type: "tool.success", callId: "c1" })
    expect(tick(1200).state).toBe("read")
    expect(tick(1260).state).toBe("think")
  })

  test("a state shows at least 400 ms", () => {
    const { at, tick } = eye()

    at(0, tool("c1", "read"))
    at(100, tool("c2", "shell"))
    expect(tick(300).state).toBe("read")
    expect(tick(400).state).toBe("shell")
  })

  test("attention and errors do not wait for the 400 ms", () => {
    const { at } = eye()

    at(0, tool("c1", "read"))
    expect(at(50, { type: "permission.asked", id: "per_1" }).state).toBe("attention")
    expect(at(60, { type: "step.failed" }).state).toBe("attention")
  })
})

describe("errors", () => {
  test("a failed tool flashes 1.5 s, then the eye carries on", () => {
    const { at, tick } = eye()

    at(0, { type: "execution.started" })
    at(500, tool("c1", "read"))
    at(1000, tool("c2", "grep"))
    expect(at(1500, { type: "tool.failed", callId: "c1" }).state).toBe("error-flash")
    expect(tick(2999).state).toBe("error-flash")
    expect(tick(3000).state).toBe("read")
  })

  test("a failed step lasts until the next step", () => {
    const { at, tick } = eye()

    at(0, { type: "execution.started" })
    expect(at(500, { type: "step.failed" }).state).toBe("error")
    expect(tick(60_000).state).toBe("error")
    expect(at(60_500, { type: "step.started" }).state).toBe("think")
  })

  test("a failed run spirals until the next prompt", () => {
    const { at } = eye()

    at(0, { type: "execution.started" })
    expect(at(500, { type: "execution.failed" }).state).toBe("error-spiral")
    expect(at(1000, { type: "step.started" }).state).toBe("error-spiral")
    at(2000, { type: "prompt.sent" })
    expect(at(2000, { type: "execution.started" }).state).toBe("think")
  })

  test("a failed compaction lasts until the next compaction or prompt", () => {
    const { at } = eye()

    expect(at(0, { type: "compaction.failed" }).state).toBe("error")
    expect(at(500, { type: "step.started" }).state).toBe("error")
    expect(at(1000, { type: "compaction.started" }).state).toBe("sleep")
  })

  test("an aborted event is never an error but a vexed reaction", () => {
    for (const event of [
      { type: "tool.failed", callId: "c1", aborted: true },
      { type: "step.failed", aborted: true },
      { type: "execution.failed", aborted: true },
      { type: "compaction.failed", aborted: true },
    ] satisfies EyeEvent[]) {
      const { at } = eye()

      at(0, tool("c1", "shell"))
      expect(at(500, event).state).toBe("vexed")
    }
  })

  test("a declined approval vexes, then the eye rests", () => {
    const { at, tick } = eye()

    at(0, { type: "execution.started" })
    at(500, tool("c1", "shell"))
    at(600, { type: "permission.asked", id: "per_1" })
    expect(at(1000, { type: "permission.replied", id: "per_1", rejected: true }).state).toBe("vexed")
    at(1010, { type: "tool.failed", callId: "c1", aborted: true })
    at(1020, { type: "step.failed", aborted: true })
    expect(at(1030, { type: "execution.interrupted" }).state).toBe("vexed")
    expect(tick(2329).state).toBe("vexed")
    expect(tick(2330).state).toBe("idle")
  })
})

describe("reactions", () => {
  test("a run that succeeds is happy for 1.1 s", () => {
    const { at, tick } = eye()

    at(0, { type: "execution.started" })
    expect(at(1000, { type: "execution.succeeded" }).state).toBe("happy")
    expect(tick(2099).state).toBe("happy")
    expect(tick(2100).state).toBe("idle")
  })

  test("coming back after 30 s away surprises it", () => {
    const { at, tick } = eye()

    expect(at(0, { type: "window.visible", awayMs: 29_000 }).state).toBe("idle")
    expect(at(1000, { type: "window.visible", awayMs: 30_000 }).state).toBe("surprised")
    expect(tick(2200).state).toBe("idle")
  })
})

describe("modifiers", () => {
  test("a tool running for more than 15 s is impatient", () => {
    const { at, tick } = eye()

    at(0, tool("c1", "shell"))
    expect(tick(15_000).mods.impatient).toBe(false)
    expect(tick(15_001).mods.impatient).toBe(true)
  })

  test("2 min at rest with no event is bored", () => {
    const { at, tick } = eye()

    at(0, { type: "execution.succeeded" })
    expect(tick(120_000).mods.bored).toBe(false)
    expect(tick(120_001).mods.bored).toBe(true)
  })

  test("a context over 80 % is tired", () => {
    const { at } = eye()

    expect(at(0, { type: "context.usage", ratio: 0.8 }).mods.tired).toBe(false)
    expect(at(10, { type: "context.usage", ratio: 0.81 }).mods.tired).toBe(true)
  })
})

describe("history", () => {
  test("records the latest transitions, newest first, with their event and tool", () => {
    const { at, tick } = eye()

    at(0, { type: "execution.started" })
    at(500, tool("c1", "grep"))
    const view = tick(500)

    expect(view.history.map((item) => item.state)).toEqual(["read", "think"])
    expect(view.history[0]).toMatchObject({ at: 500, tool: "grep", event: "tool.input.started" })
  })

  test("shows the 5 latest", () => {
    const { at } = eye()
    let view = at(0, { type: "execution.started" })

    for (let i = 1; i <= 8; i++) view = at(i * 500, tool(`c${i}`, i % 2 ? "read" : "shell"))
    expect(view.history).toHaveLength(5)
  })
})

describe("seed", () => {
  const running = { running: true, compacting: false, tools: [{ id: "c1", name: "shell" }], asks: [] }

  test("an eye that joins mid-run shows the tool in flight", () => {
    const view = new EyeStateMachine({}, 0).seed(running, 5)

    expect(view.state).toBe("shell")
    expect(view.history[0]?.event).toBe(SEED)
  })

  test("a pending approval stares", () => {
    expect(new EyeStateMachine({}, 0).seed({ ...running, asks: [{ id: "per_1" }] }, 5).state).toBe("attention")
  })

  test("once a server event came, a seed changes nothing", () => {
    const machine = new EyeStateMachine({}, 0)

    machine.dispatch({ type: "execution.succeeded" }, 1)
    expect(machine.seed(running, 2000).state).toBe("idle")
  })
})

describe("sameView", () => {
  test("a tick that changes nothing gives the same view", () => {
    const { at, tick } = eye()
    const view = at(0, tool("c1", "read"))

    expect(sameView(view, tick(100))).toBe(true)
    expect(sameView(view, tick(20_000))).toBe(false) // impatient
  })
})
