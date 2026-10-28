/**
 * The eye's state machine: a pure reduction of server events into one state per session. No Solid, no SDK:
 * the window feeds it events and the time, and renders `mood`.
 */

export type ToolKind = "read" | "edit" | "shell" | "generic"

export type Mood = "idle" | "thinking" | "tool" | "attention" | "error" | "sleeping"

/** The fields of a server event the machine reads. An `OpenCodeEvent` fits. */
export interface EyeEvent {
  readonly type: string
  readonly data?: unknown
}

export interface RunningTool {
  readonly id: string
  /** The tool's name, from `session.tool.input.started`; empty when the eye joined after it. */
  readonly name: string
  readonly kind: ToolKind
  readonly since: number
  /** The inner tool a wrapper such as `execute` runs, from its progress. */
  readonly inner?: string
}

export interface Ask {
  readonly id: string
  readonly kind: "permission" | "question"
  /** The permission's action, or the question's title. */
  readonly label?: string
  readonly since: number
}

export interface EyeError {
  readonly scope: "tool" | "step" | "execution" | "compaction"
  readonly message: string
  readonly at: number
  /** A tool failure only flashes: the error shows until then. Other errors stay until work starts again. */
  readonly until?: number
}

export interface Transition {
  readonly at: number
  readonly mood: Mood
  readonly tool?: string
  /** The event that caused it. */
  readonly event: string
}

export interface EyeState {
  readonly running: boolean
  /** When the current execution started. */
  readonly started?: number
  /** Tools in flight, oldest first. The last one is the one the eye shows. */
  readonly tools: readonly RunningTool[]
  readonly asks: readonly Ask[]
  readonly compacting: boolean
  readonly error?: EyeError
  readonly mood: Mood
  /** When `mood` (or the tool shown) last changed. */
  readonly since: number
  /** The latest transitions, oldest first. */
  readonly history: readonly Transition[]
}

export type Sessions = Readonly<Record<string, EyeState>>

/** The internal event that expires a flashing error; dispatch it at `deadline(state)`. */
export const TICK = "eye.tick"

export const FLASH_MS = 1500
export const HISTORY = 20

const READ = new Set(["read", "grep", "glob", "search", "list", "ls", "find", "codesearch"])
const EDIT = new Set(["patch", "apply_patch", "edit", "multiedit", "write"])
const SHELL = new Set(["shell", "bash", "terminal"])

export function kindOf(name: string): ToolKind {
  const key = name.toLowerCase()

  if (READ.has(key)) return "read"
  if (EDIT.has(key)) return "edit"
  if (SHELL.has(key)) return "shell"
  return "generic"
}

export function initial(now: number): EyeState {
  return { running: false, tools: [], asks: [], compacting: false, mood: "idle", since: now, history: [] }
}

/** The tool the eye shows: the latest one started. */
export function currentTool(state: EyeState): RunningTool | undefined {
  return state.tools.at(-1)
}

export function moodOf(state: Pick<EyeState, "asks" | "compacting" | "error" | "tools" | "running">, now: number): Mood {
  if (state.asks.length > 0) return "attention"
  if (state.compacting) return "sleeping"
  if (state.error && (state.error.until === undefined || now < state.error.until)) return "error"
  if (state.tools.length > 0) return "tool"
  if (state.running) return "thinking"
  return "idle"
}

/** When the mood may change with no new event (a flashing error ends), else undefined. */
export function deadline(state: EyeState, now: number): number | undefined {
  const until = state.error?.until

  return until !== undefined && until > now ? until : undefined
}

/** The session an event is about, or undefined for events the eye ignores. */
export function sessionOf(event: EyeEvent): string | undefined {
  const data = record(event.data)
  const id = data.sessionID ?? record(data.form).sessionID

  return typeof id === "string" ? id : undefined
}

/** Applies one event to one session's state. Returns the same object when nothing changed. */
export function reduce(state: EyeState, event: EyeEvent, now: number): EyeState {
  const next = apply(state, event, now)

  if (next === state && moodOf(state, now) === state.mood) return state
  return settle(state, next, event.type, now)
}

/** Applies one event to every session's state. Returns the same object when no session changed. */
export function reduceSessions(sessions: Sessions, event: EyeEvent, now: number): Sessions {
  if (event.type === TICK) {
    let changed = false
    const next: Record<string, EyeState> = {}

    for (const [id, state] of Object.entries(sessions)) {
      next[id] = reduce(state, event, now)
      if (next[id] !== state) changed = true
    }

    return changed ? next : sessions
  }

  const id = sessionOf(event)

  if (!id) return sessions
  if (event.type === "session.deleted") {
    if (!(id in sessions)) return sessions
    const { [id]: _, ...rest } = sessions

    return rest
  }

  const state = sessions[id] ?? initial(now)
  const next = reduce(state, event, now)

  return next === sessions[id] ? sessions : { ...sessions, [id]: next }
}

type Draft = Omit<EyeState, "mood" | "since" | "history"> & Partial<Pick<EyeState, "mood" | "since" | "history">>

function apply(state: EyeState, event: EyeEvent, now: number): EyeState | Draft {
  const data = record(event.data)

  switch (event.type) {
    case TICK:
      return state.error?.until !== undefined && now >= state.error.until ? { ...state, error: undefined } : state

    case "session.execution.started":
      return { ...state, running: true, started: now, tools: [], asks: [], compacting: false, error: undefined }

    case "session.execution.succeeded":
    case "session.execution.interrupted":
      return { ...state, running: false, tools: [], asks: [], compacting: false }

    case "session.execution.failed":
      return {
        ...state,
        running: false,
        tools: [],
        asks: [],
        compacting: false,
        error: { scope: "execution", message: messageOf(data), at: now },
      }

    case "session.step.started":
      return {
        ...state,
        running: true,
        started: state.started ?? now,
        error: state.error?.scope === "step" ? undefined : state.error,
      }

    case "session.reasoning.started":
    case "session.text.started":
      return state.running ? state : { ...state, running: true, started: state.started ?? now }

    case "session.step.failed":
      return { ...state, tools: [], error: { scope: "step", message: messageOf(data), at: now } }

    case "session.tool.input.started": {
      const id = string(data.id)
      const name = string(data.name) ?? ""

      if (!id || state.tools.some((tool) => tool.id === id)) return state
      return { ...state, running: true, tools: [...state.tools, { id, name, kind: kindOf(name), since: now }] }
    }

    case "session.tool.called": {
      const id = string(data.id)

      // Joined mid-run: the name went by before the eye listened, but a tool is still at work.
      if (!id || state.tools.some((tool) => tool.id === id)) return state
      return { ...state, running: true, tools: [...state.tools, { id, name: "", kind: "generic", since: now }] }
    }

    case "session.tool.progress": {
      const id = string(data.id)
      const inner = innerTool(record(data.metadata).toolCalls)
      const tool = state.tools.find((item) => item.id === id)

      if (!tool || !inner || tool.inner === inner) return state
      return { ...state, tools: state.tools.map((item) => (item === tool ? { ...item, inner } : item)) }
    }

    case "session.tool.success":
    case "session.tool.failed": {
      const id = string(data.id)
      const tools = state.tools.filter((tool) => tool.id !== id)
      const failed = event.type === "session.tool.failed"

      if (!failed && tools.length === state.tools.length) return state
      return {
        ...state,
        tools,
        error: failed ? { scope: "tool", message: messageOf(data), at: now, until: now + FLASH_MS } : state.error,
      }
    }

    case "permission.asked": {
      const id = string(data.id)

      if (!id || state.asks.some((ask) => ask.id === id)) return state
      return { ...state, asks: [...state.asks, { id, kind: "permission", label: string(data.action), since: now }] }
    }

    case "form.created": {
      const form = record(data.form)
      const id = string(form.id)

      if (!id || state.asks.some((ask) => ask.id === id)) return state
      return { ...state, asks: [...state.asks, { id, kind: "question", label: string(form.title), since: now }] }
    }

    case "permission.replied":
    case "form.replied":
    case "form.cancelled": {
      const id = string(event.type === "permission.replied" ? data.requestID : data.id)
      const asks = state.asks.filter((ask) => ask.id !== id)

      return asks.length === state.asks.length ? state : { ...state, asks }
    }

    case "session.compaction.started":
      return {
        ...state,
        compacting: true,
        error: state.error?.scope === "compaction" ? undefined : state.error,
      }

    case "session.compaction.ended":
      return state.compacting ? { ...state, compacting: false } : state

    case "session.compaction.failed":
      return { ...state, compacting: false, error: { scope: "compaction", message: messageOf(data), at: now } }

    default:
      return state
  }
}

/** Derives the mood and records a transition when what the eye shows changes. */
function settle(previous: EyeState, draft: Draft, event: string, now: number): EyeState {
  const mood = moodOf(draft, now)
  const tool = mood === "tool" ? draft.tools.at(-1)?.name : undefined
  const shown = previous.mood === "tool" ? previous.tools.at(-1)?.name : undefined

  if (mood === previous.mood && tool === shown) return { ...draft, mood, since: previous.since, history: previous.history }

  const history = [...previous.history, { at: now, mood, tool, event }].slice(-HISTORY)

  return { ...draft, mood, since: now, history }
}

function innerTool(calls: unknown): string | undefined {
  if (!Array.isArray(calls) || calls.length === 0) return undefined
  const running = calls.findLast((call) => record(call).status === "running") ?? calls.at(-1)

  return string(record(running).tool)
}

function messageOf(data: Record<string, unknown>): string {
  return string(record(data.error).message) ?? ""
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {}
}

function string(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined
}
