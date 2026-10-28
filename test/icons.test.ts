import { describe, expect, test } from "bun:test"
import { ICON_NAMES } from "../src/gui/icon-names"
import { isIconName, runningIcon, serverOf, toolIcon } from "../src/gui/icons"

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

describe("MCP icons the user chose", () => {
  const custom = { Tracker: "flask", git: "branch", github: "github", broken: "not-an-icon" }

  test("an MCP tool takes its server's icon, whatever the separator or case", () => {
    expect(toolIcon("tracker.get_issue", custom)).toBe("flask")
    expect(toolIcon("TRACKER_get_issue", custom)).toBe("flask")
    expect(toolIcon("tracker", custom)).toBe("flask")
  })

  test("the longest server name wins", () => {
    expect(toolIcon("github.create_issue", custom)).toBe("github")
    expect(toolIcon("git.status", custom)).toBe("branch")
  })

  test("a name that only starts like a server is not its tool", () => {
    expect(toolIcon("trackers.list", custom)).toBe("mcp")
  })

  test("built-in tools keep their icon", () => {
    expect(toolIcon("grep", { grep: "flask" })).toBe("magnifying-glass")
  })

  test("an icon the app does not have is ignored", () => {
    expect(toolIcon("broken.call", custom)).toBe("mcp")
  })

  test("a wrapper's inner MCP tool takes its server's icon", () => {
    expect(
      runningIcon({ id: "c1", name: "execute", kind: "generic", since: 0, inner: "tracker.get_issue" }, custom),
    ).toBe("flask")
  })
})

describe("serverOf", () => {
  test("returns the configured name as written", () => {
    expect(serverOf("tracker.get_issue", ["Tracker"])).toBe("Tracker")
    expect(serverOf("other.call", ["Tracker"])).toBeUndefined()
  })
})

describe("ICON_NAMES", () => {
  test("lists the SDK's icons, each once", () => {
    expect(ICON_NAMES.length).toBeGreaterThan(100)
    expect(new Set(ICON_NAMES).size).toBe(ICON_NAMES.length)
    expect(isIconName("mcp")).toBe(true)
    expect(isIconName("not-an-icon")).toBe(false)
  })
})
