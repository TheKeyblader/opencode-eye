import type { Look } from "./motion"

/** One state of the eye, as the settings gallery and the preview page show it. */
export interface GalleryItem {
  /** Its copy is `states.<key>` (title) and `states.<key>.text` (what it means). */
  readonly key: string
  readonly look: Look
  /** A tool name whose icon the badge shows, for the tool states. */
  readonly tool?: string
}

export const GALLERY: readonly GalleryItem[] = [
  { key: "idle", look: { mood: "idle" } },
  { key: "thinking", look: { mood: "thinking" } },
  { key: "read", look: { mood: "tool", kind: "read" }, tool: "read" },
  { key: "edit", look: { mood: "tool", kind: "edit" }, tool: "patch" },
  { key: "shell", look: { mood: "tool", kind: "shell" }, tool: "shell" },
  { key: "generic", look: { mood: "tool", kind: "generic" }, tool: "server.tool" },
  { key: "attention", look: { mood: "attention" } },
  { key: "flash", look: { mood: "error" } },
  { key: "stuck", look: { mood: "error", stuck: true } },
  { key: "sleeping", look: { mood: "sleeping" } },
]
