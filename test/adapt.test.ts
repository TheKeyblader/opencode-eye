import { describe, expect, test } from "bun:test"
import { adapt, contextTokens, sessionOf, stepUsage } from "../src/gui/adapt"
import { EyeStateMachine } from "../src/gui/machine"
import capture from "./fixtures/capture.json"

const data = (fields: Record<string, unknown>) => ({ sessionID: "ses_a", ...fields })

describe("adapt", () => {
  test("a run starts with a prompt", () => {
    expect(adapt({ type: "session.execution.started", data: data({}) }).map((event) => event.type)).toEqual([
      "prompt.sent",
      "execution.started",
    ])
  })

  test("the tool's name comes with its input", () => {
    expect(adapt({ type: "session.tool.input.started", data: data({ id: "c1", name: "grep" }) })).toEqual([
      { type: "tool.input.started", callId: "c1", tool: "grep" },
    ])
  })

  test("execute's progress names the tool it calls", () => {
    const toolCalls = [
      { tool: "tracker.list", status: "completed" },
      { tool: "tracker.get_issue", status: "running" },
    ]

    expect(adapt({ type: "session.tool.progress", data: data({ id: "c1", metadata: { toolCalls } }) })).toEqual([
      { type: "tool.called", callId: "c1", tool: "execute", innerTool: "tracker.get_issue" },
    ])
    expect(adapt({ type: "session.tool.progress", data: data({ id: "c1" }) })).toEqual([])
  })

  test("an aborted failure says so", () => {
    expect(
      adapt({ type: "session.tool.failed", data: data({ id: "c1", error: { type: "aborted", message: "declined" } }) }),
    ).toEqual([{ type: "tool.failed", callId: "c1", aborted: true }])
    expect(adapt({ type: "session.step.failed", data: data({ error: { message: "boom" } }) })).toEqual([
      { type: "step.failed", aborted: false },
    ])
  })

  test("a rejected approval", () => {
    expect(adapt({ type: "permission.replied", data: data({ requestID: "per_1", reply: "reject" }) })).toEqual([
      { type: "permission.replied", id: "per_1", rejected: true },
    ])
    expect(adapt({ type: "permission.replied", data: data({ requestID: "per_1", reply: "always" }) })).toEqual([
      { type: "permission.replied", id: "per_1", rejected: false },
    ])
  })

  test("a question's form", () => {
    expect(adapt({ type: "form.created", data: { form: { id: "frm_1", sessionID: "ses_a" } } })).toEqual([
      { type: "form.created", id: "frm_1" },
    ])
    expect(adapt({ type: "form.replied", data: data({ id: "frm_1" }) })).toEqual([
      { type: "form.replied", id: "frm_1" },
    ])
  })

  test("ignores what the eye does not show", () => {
    expect(adapt({ type: "session.text.delta", data: data({ delta: "…" }) })).toEqual([])
  })
})

describe("sessionOf", () => {
  test("reads the session of an event, or of its form", () => {
    expect(sessionOf({ type: "session.step.started", data: data({}) })).toBe("ses_a")
    expect(sessionOf({ type: "form.created", data: { form: { sessionID: "ses_b" } } })).toBe("ses_b")
    expect(sessionOf({ type: "server.connected", data: {} })).toBeUndefined()
  })
})

describe("context usage", () => {
  test("sums every token of a step", () => {
    expect(contextTokens({ input: 1000, output: 200, reasoning: 50, cache: { read: 30_000, write: 500 } })).toBe(31_750)
    expect(contextTokens(undefined)).toBeUndefined()
  })

  test("a step's usage names its message", () => {
    const tokens = { input: 10, output: 5, reasoning: 0, cache: { read: 0, write: 0 } }

    expect(stepUsage({ type: "session.step.ended", data: data({ assistantMessageID: "msg_1", tokens }) })).toEqual({
      messageID: "msg_1",
      tokens: 15,
    })
    expect(stepUsage({ type: "session.step.started", data: data({}) })).toBeUndefined()
  })
})

describe("a real capture", () => {
  test("replays to a happy end, then rest", () => {
    const machine = new EyeStateMachine({}, 0)
    const states = new Set<string>()
    let last = 0

    for (const event of capture as { t: number; type: string; data: unknown }[]) {
      if (sessionOf(event) !== "ses_a") continue
      last = event.t
      for (const item of adapt(event)) states.add(machine.dispatch(item, event.t).state)
      states.add(machine.tick(event.t).state)
    }

    expect([...states]).toEqual(expect.arrayContaining(["think", "read", "error-flash", "happy"]))
    expect(machine.tick(last + 2000).state).toBe("idle")
  })
})
