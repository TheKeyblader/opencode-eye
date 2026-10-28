import { describe, expect, test } from "bun:test"
import { createRoot } from "solid-js"
import { createEventLog, sessionOf, trim } from "../src/gui/debug"

describe("trim", () => {
  test("cuts long strings and arrays", () => {
    const out = trim({ text: "x".repeat(500), list: Array.from({ length: 25 }, (_, i) => i) }) as {
      text: string
      list: unknown[]
    }

    expect(out.text).toEndWith("…(+100 chars)")
    expect(out.list).toHaveLength(21)
    expect(out.list.at(-1)).toBe("…(+5 items)")
  })

  test("stops at depth", () => {
    expect(trim({ a: { b: { c: { d: { e: { f: { g: 1 } } } } } } })).toEqual({
      a: { b: { c: { d: { e: { f: "[…]" } } } } },
    })
  })
})

describe("sessionOf", () => {
  test("reads data.sessionID", () => {
    expect(sessionOf({ type: "session.tool.called", data: { sessionID: "ses_1" } })).toBe("ses_1")
    expect(sessionOf({ type: "server.connected", data: {} })).toBeUndefined()
  })
})

describe("createEventLog", () => {
  test("samples deltas but counts them all", () =>
    createRoot((dispose) => {
      const log = createEventLog()

      for (let i = 0; i < 10; i++) log.record("session.text.delta", { data: { sessionID: "s" } })
      log.record("session.tool.called", { data: { sessionID: "s" } })

      expect(log.counts["session.text.delta"]).toBe(10)
      expect(log.entries.map((entry) => entry.name)).toEqual([
        "session.text.delta",
        "session.text.delta",
        "session.text.delta",
        "session.tool.called",
      ])
      dispose()
    }))
})
