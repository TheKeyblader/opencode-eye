import { STATES, type EyeState, type Mods } from "./machine"

/** One state of the eye, as the settings gallery and the preview page show it. */
export interface GalleryItem {
  /** Its copy is `states.<key>`. */
  readonly key: string
  readonly state: EyeState
  /** A tool name for the badge, for the tool states. */
  readonly tool?: string
  /** A modifier the item shows, on top of its state. */
  readonly mod?: keyof Mods
}

// A tool of each kind, for the badge.
const TOOLS: Partial<Record<EyeState, string>> = {
  read: "grep",
  write: "patch",
  shell: "shell",
  generic: "tracker.get_issue",
  delegate: "subagent",
  web: "webfetch",
  plan: "todowrite",
}

export const NO_MODS: Mods = { impatient: false, bored: false, tired: false }

/** The 18 states, then the 3 modifiers. */
export const GALLERY: readonly GalleryItem[] = [
  ...STATES.map((state) => ({ key: state, state, tool: TOOLS[state] })),
  { key: "impatient", state: "shell", tool: "shell", mod: "impatient" },
  { key: "bored", state: "idle", mod: "bored" },
  { key: "tired", state: "think", mod: "tired" },
]

export const modsOf = (item: GalleryItem): Mods => (item.mod ? { ...NO_MODS, [item.mod]: true } : NO_MODS)
