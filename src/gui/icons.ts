import type { IconName } from "@opencode/plugin/gui"
import { kindOf, type RunningTool, type ToolKind } from "./state"

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

/** Unknown tools, by the kind the state machine gives them. */
const KINDS: Readonly<Record<ToolKind, IconName>> = {
  read: "glasses",
  edit: "edit",
  shell: "console",
  generic: "extensions",
}

/**
 * The icon for a tool name. MCP tools (`server.tool` or `server_tool`, unknown here) get the MCP icon; any other
 * unknown name falls back on its kind.
 */
export function toolIcon(name: string): IconName {
  const key = name.toLowerCase()
  const known = TOOLS[key]

  if (known) return known
  if (key.includes(".") || key.includes("_")) return "mcp"
  return KINDS[kindOf(key)]
}

/** The icon for a running tool: a wrapper such as `execute` shows the inner tool it runs. */
export function runningIcon(tool: RunningTool): IconName {
  return toolIcon(tool.inner ?? tool.name)
}
