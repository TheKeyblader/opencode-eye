import type { IconName } from "@opencode/plugin/gui"
import { ICON_NAMES } from "./icon-names"
import { classifyTool, type ToolKind } from "./machine"

/** Icons the user chose, by MCP server name. Values come from storage: check them with `isIconName`. */
export type McpIcons = Readonly<Record<string, string>>

/** Known tools, by lowercase name. */
const TOOLS: Readonly<Record<string, IconName>> = {
  read: "file-document",
  grep: "magnifying-glass",
  glob: "file-tree",
  search: "magnifying-glass",
  codesearch: "magnifying-glass",
  find: "magnifying-glass",
  list: "folder",
  ls: "folder",
  patch: "pencil-line",
  apply_patch: "pencil-line",
  edit: "pencil-line",
  multiedit: "pencil-line",
  write: "edit",
  shell: "terminal",
  bash: "terminal",
  terminal: "terminal",
  execute: "code",
  subagent: "task",
  task: "task",
  question: "speech-bubble",
  todowrite: "checklist",
  todoread: "checklist",
  todo: "checklist",
  webfetch: "globe",
  websearch: "outline-globe",
  fetch: "globe",
  browser: "window-cursor",
  skill: "post-skill",
}

/** Unknown tools, by the kind the state machine gives them: the spec's magnifier, pencil, terminal, branch… */
const KINDS: Readonly<Record<ToolKind, IconName>> = {
  read: "magnifying-glass",
  write: "pencil-line",
  shell: "terminal",
  delegate: "branch",
  web: "globe",
  plan: "checklist",
  generic: "extensions",
}

const VALID: ReadonlySet<string> = new Set(ICON_NAMES)

export const isIconName = (value: string): value is IconName => VALID.has(value)

/**
 * The MCP server a tool belongs to, among `servers`: the tool is the server itself, or is named `server.tool` or
 * `server_tool`. The longest matching name wins, so `git` does not take `github`'s tools. Case is ignored.
 */
export function serverOf(tool: string, servers: Iterable<string>): string | undefined {
  const key = tool.toLowerCase()
  let best: string | undefined

  for (const server of servers) {
    const name = server.toLowerCase()
    const matches = key === name || key.startsWith(`${name}.`) || key.startsWith(`${name}_`)

    if (matches && (!best || name.length > best.length)) best = server
  }

  return best
}

/**
 * The icon for a tool name. Built-in tools keep theirs. An MCP tool takes the icon chosen for its server, else the
 * MCP icon; any other unknown name falls back on its kind.
 */
export function toolIcon(name: string, custom: McpIcons = {}): IconName {
  const key = name.toLowerCase()
  const known = TOOLS[key]

  if (known) return known

  const server = serverOf(key, Object.keys(custom))
  const chosen = server === undefined ? undefined : custom[server]

  if (chosen && isIconName(chosen)) return chosen
  if (key.includes(".") || key.includes("_")) return "mcp"
  return KINDS[classifyTool(key)]
}
