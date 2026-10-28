import { describe, expect, test } from "bun:test"
import { runningIcon, toolIcon } from "../src/gui/icons"

describe("toolIcon", () => {
  test("maps the tools seen in the capture", () => {
    expect(toolIcon("read")).toBe("file-document")
    expect(toolIcon("grep")).toBe("magnifying-glass")
    expect(toolIcon("glob")).toBe("file-tree")
    expect(toolIcon("patch")).toBe("pencil-line")
    expect(toolIcon("shell")).toBe("terminal")
    expect(toolIcon("execute")).toBe("code")
    expect(toolIcon("subagent")).toBe("task")
    expect(toolIcon("question")).toBe("speech-bubble")
  })

  test("ignores case", () => {
    expect(toolIcon("Bash")).toBe("terminal")
  })

  test("gives MCP tools the MCP icon", () => {
    expect(toolIcon("tracker.get_issue")).toBe("mcp")
    expect(toolIcon("github_create_issue")).toBe("mcp")
  })

  test("falls back on the tool's kind, then on a generic icon", () => {
    expect(toolIcon("frobnicate")).toBe("extensions")
    expect(toolIcon("")).toBe("extensions")
  })
})

describe("runningIcon", () => {
  test("a wrapper shows the inner tool it runs", () => {
    expect(runningIcon({ id: "c1", name: "execute", kind: "generic", since: 0 })).toBe("code")
    expect(runningIcon({ id: "c1", name: "execute", kind: "generic", since: 0, inner: "tracker.get_issue" })).toBe("mcp")
    expect(runningIcon({ id: "c1", name: "execute", kind: "generic", since: 0, inner: "search" })).toBe("magnifying-glass")
  })
})
