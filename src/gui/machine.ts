/**
 * The eye's state machine, ported from `reference/eye-state.ts` (validated in the mock-up): what the eye shows for the
 * events of one session. No Solid, no SDK: the window feeds it events (see adapt.ts) and the time.
 *
 * Differences from the reference:
 * - The view carries no label: labels.ts writes it in the user's language from `state`, `tool` and `mods`.
 * - A transition records its state and tool name, for the same reason.
 * - `seed` fills in an eye that joins a session mid-run from what the server already holds.
 *
 * Call `dispatch` on each event and `tick` regularly (about every 100 ms) while the eye is on screen: the minimum time
 * per state, the delay before thinking, the reactions' durations and the modifiers resolve with time.
 */

export type ToolKind = "read" | "write" | "shell" | "delegate" | "web" | "plan" | "generic"

/** What the eye shows: the value of `data-state`. */
export type EyeState =
  | "idle"
  | "think"
  | "respond"
  | ToolKind
  | "attention"
  | "sleep"
  | "error-flash"
  | "error"
  | "error-spiral"
  | "happy"
  | "vexed"
  | "surprised"

/** Every state, in the order the spec lists them. */
export const STATES: readonly EyeState[] = [
  "idle",
  "think",
  "respond",
  "read",
  "write",
  "shell",
  "generic",
  "delegate",
  "web",
  "plan",
  "attention",
  "sleep",
  "error-flash",
  "error",
  "error-spiral",
  "happy",
  "vexed",
  "surprised",
]

/** What the machine understands: server events once adapted (see adapt.ts), and a few client-side ones. */
export type EyeEvent =
  | { type: "execution.started" }
  | { type: "step.started" }
  | { type: "reasoning.started" }
  | { type: "text.started" }
  | { type: "tool.input.started"; callId: string; tool: string; innerTool?: string }
  | { type: "tool.called"; callId: string; tool: string; innerTool?: string }
  | { type: "tool.success"; callId: string }
  | { type: "tool.failed"; callId: string; aborted?: boolean }
  | { type: "permission.asked"; id: string }
  | { type: "permission.replied"; id: string; rejected?: boolean }
  | { type: "form.created"; id: string }
  | { type: "form.replied"; id: string }
  | { type: "form.cancelled"; id: string }
  | { type: "compaction.started" }
  | { type: "compaction.ended" }
  | { type: "compaction.failed"; aborted?: boolean }
  | { type: "step.failed"; aborted?: boolean }
  | { type: "execution.failed"; aborted?: boolean }
  | { type: "execution.succeeded" }
  | { type: "execution.interrupted" }
  // A new prompt from the user.
  | { type: "prompt.sent" }
  // Client side: the window is visible again after `awayMs`.
  | { type: "window.visible"; awayMs: number }
  // 0…1, when known.
  | { type: "context.usage"; ratio: number }

/** A tool in flight. */
export interface ActiveTool {
  /** The call's id, from the server. */
  readonly callId: string
  /** The tool's name, or the inner tool's for a wrapper such as `execute`. Empty when the eye missed its start. */
  readonly name: string
  /** How the eye shows it: see `classifyTool`. */
  readonly kind: ToolKind
  readonly since: number
}

/** The modifiers time adds on top of a state. */
export interface Mods {
  /** The tool shown has been running for more than `impatientMs`. */
  readonly impatient: boolean
  /** At rest with no event for more than `boredMs`. */
  readonly bored: boolean
  /** The context is fuller than `tiredRatio`. */
  readonly tired: boolean
}

/** A change of what the eye shows. */
export interface Transition {
  readonly at: number
  readonly state: EyeState
  readonly tool?: string
  /** The event that caused it. */
  readonly event: string
}

/** What the eye shows at a given time: `tick`'s answer. */
export interface EyeView {
  readonly state: EyeState
  /** The tool the badge shows. */
  readonly tool: ActiveTool | null
  /** Tools in flight: the badge shows `×N` when more than one. */
  readonly count: number
  readonly mods: Mods
  /** When the state shown started. */
  readonly since: number
  /** The latest transitions, newest first. */
  readonly history: readonly Transition[]
}

/** What the server already knows about a session (see seed.ts). */
export interface Snapshot {
  /** The session runs: the eye thinks unless a tool shows. */
  readonly running: boolean
  /** A compaction is in progress. */
  readonly compacting: boolean
  readonly tools: readonly { readonly id: string; readonly name: string }[]
  /** Pending approvals and questions, by id. */
  readonly asks: readonly { readonly id: string }[]
}

/** The machine's timings and thresholds, in ms and as a ratio: `DEFAULT_OPTIONS` holds the spec's. */
export interface EyeOptions {
  readonly minDwellMs: number
  readonly thinkDelayMs: number
  readonly flashMs: number
  readonly happyMs: number
  readonly vexedMs: number
  readonly surprisedMs: number
  readonly surprisedAwayMs: number
  readonly impatientMs: number
  readonly boredMs: number
  readonly tiredRatio: number
}

/** The timings of the spec. */
export const DEFAULT_OPTIONS: EyeOptions = {
  // The least time a state shows.
  minDwellMs: 400,
  // The wait before going from a tool to thinking.
  thinkDelayMs: 250,
  // The error flash of a failed tool.
  flashMs: 1500,
  happyMs: 1100,
  vexedMs: 1300,
  surprisedMs: 1200,
  surprisedAwayMs: 30_000,
  impatientMs: 15_000,
  boredMs: 120_000,
  tiredRatio: 0.8,
}

/** The event name a seed records in the history. */
export const SEED = "eye.seed"

const HISTORY = 20
const SHOWN = 5

const TOOL_KINDS: Readonly<Record<string, ToolKind>> = {
  read: "read",
  grep: "read",
  glob: "read",
  search: "read",
  list: "read",
  ls: "read",
  find: "read",
  codesearch: "read",
  patch: "write",
  apply_patch: "write",
  edit: "write",
  multiedit: "write",
  write: "write",
  shell: "shell",
  bash: "shell",
  terminal: "shell",
  task: "delegate",
  subagent: "delegate",
  webfetch: "web",
  websearch: "web",
  todowrite: "plan",
  todoread: "plan",
}

/** How the eye shows a tool, by its name, whatever its case: anything unknown is `generic`. */
export function classifyTool(name: string): ToolKind {
  return TOOL_KINDS[name.toLowerCase()] ?? "generic"
}

/** The order the eye picks among tools running in parallel: the most "intense" first. */
const TOOL_PRIORITY: readonly ToolKind[] = ["write", "shell", "delegate", "read", "web", "plan", "generic"]
const TOOL_STATES: ReadonlySet<EyeState> = new Set(TOOL_PRIORITY)

/** The states that show a tool. */
export const isToolState = (state: EyeState): state is ToolKind => TOOL_STATES.has(state)
/** The short reactions: they last a fixed time. */
export const isReaction = (state: EyeState) => state === "happy" || state === "vexed" || state === "surprised"
/** The error states. */
export const isError = (state: EyeState) => state === "error-flash" || state === "error" || state === "error-spiral"

type ErrorInfo =
  | { state: "error-flash"; until: number }
  | { state: "error"; clearOn: "step" | "compaction-or-prompt" }
  | { state: "error-spiral"; clearOn: "prompt" }

type Reaction = "happy" | "vexed" | "surprised"

/** One session's eye: events in, what the eye shows out. Not reactive: hand its views to a signal. */
export class EyeStateMachine {
  private readonly o: EyeOptions

  // Model
  private activity: "idle" | "think" | "respond" = "idle"
  private readonly tools = new Map<string, ActiveTool>()
  private readonly waits = new Set<string>()
  private compacting = false
  private error: ErrorInfo | null = null
  private reaction: { state: Reaction; until: number } | null = null
  private lastEventAt: number
  private contextRatio = 0
  private lastEventName = "—"
  // Whether a server event reached the machine: a seed then has nothing to add.
  private seen = false

  // Display
  private shown: EyeState = "idle"
  private shownTool: ActiveTool | null = null
  private shownSince: number
  private thinkPendingSince: number | null = null
  private readonly history: Transition[] = []

  constructor(options: Partial<EyeOptions> = {}, now = Date.now()) {
    this.o = { ...DEFAULT_OPTIONS, ...options }
    this.lastEventAt = now
    // The first change of state goes through without waiting.
    this.shownSince = now - this.o.minDwellMs
  }

  /** Applies an event at `now`, then ticks. */
  dispatch(event: EyeEvent, now = Date.now()): EyeView {
    this.apply(event, now)
    this.lastEventName = event.type
    return this.tick(now)
  }

  /**
   * Fills in an eye that joined a session mid-run: whether it runs, its tools in flight, its pending approvals and
   * questions. Only until the first server event: events know better than a snapshot. A later seed only adds.
   */
  seed(snapshot: Snapshot, now = Date.now()): EyeView {
    if (this.seen) return this.tick(now)

    if (snapshot.running && this.activity === "idle") this.activity = "think"
    if (snapshot.compacting) this.compacting = true
    for (const tool of snapshot.tools) {
      if (!this.tools.has(tool.id))
        this.tools.set(tool.id, { callId: tool.id, name: tool.name, kind: classifyTool(tool.name), since: now })
    }
    for (const ask of snapshot.asks) this.waits.add(ask.id)
    this.lastEventName = SEED
    return this.tick(now)
  }

  tick(now = Date.now()): EyeView {
    const candidate = this.candidate(now)
    let next = candidate.state
    let nextTool = candidate.tool

    const urgent = next === "attention" || next === "sleep" || isError(next) || isReaction(next)

    // The delay before thinking when a tool ends: a tool that follows closely skips thinking.
    if (next === "think" && isToolState(this.shown)) {
      if (this.thinkPendingSince === null) this.thinkPendingSince = now
      if (now - this.thinkPendingSince < this.o.thinkDelayMs) {
        next = this.shown
        nextTool = this.shownTool
      }
    } else {
      this.thinkPendingSince = null
    }

    const changed = next !== this.shown || (nextTool?.callId ?? null) !== (this.shownTool?.callId ?? null)

    if (changed) {
      // States of a fixed length (reactions, the flash) give way without waiting for the minimum time.
      const leavingTransient = isReaction(this.shown) || this.shown === "error-flash"
      const dwellOk = now - this.shownSince >= this.o.minDwellMs

      if (urgent || leavingTransient || dwellOk) {
        const stateChanged = next !== this.shown

        this.shown = next
        this.shownTool = nextTool
        if (stateChanged) this.shownSince = now
        this.history.unshift({
          at: now,
          state: next,
          tool: isToolState(next) ? nextTool?.name : undefined,
          event: this.lastEventName,
        })
        if (this.history.length > HISTORY) this.history.length = HISTORY
      }
    } else if (nextTool) {
      // The same call, renamed by its inner tool (the reference mutates it in place).
      this.shownTool = nextTool
    }

    const tool = isToolState(this.shown) ? this.shownTool : null

    return {
      state: this.shown,
      tool,
      count: isToolState(this.shown) ? Math.max(1, this.tools.size) : 0,
      mods: {
        impatient: !!tool && now - tool.since > this.o.impatientMs,
        bored: this.shown === "idle" && now - this.lastEventAt > this.o.boredMs,
        tired: this.contextRatio > this.o.tiredRatio,
      },
      since: this.shownSince,
      history: this.history.slice(0, SHOWN),
    }
  }

  private react(state: Reaction, now: number) {
    const ms = state === "happy" ? this.o.happyMs : state === "vexed" ? this.o.vexedMs : this.o.surprisedMs

    this.reaction = { state, until: now + ms }
  }

  private pickTool(): ActiveTool | null {
    let best: ActiveTool | null = null

    for (const tool of this.tools.values()) {
      if (!best) {
        best = tool
        continue
      }
      const a = TOOL_PRIORITY.indexOf(tool.kind)
      const b = TOOL_PRIORITY.indexOf(best.kind)

      if (a < b || (a === b && tool.since > best.since)) best = tool
    }
    return best
  }

  private candidate(now: number): { state: EyeState; tool: ActiveTool | null } {
    if (this.error?.state === "error-flash" && now >= this.error.until) this.error = null
    if (this.reaction && now >= this.reaction.until) this.reaction = null

    if (this.waits.size) return { state: "attention", tool: null }
    if (this.compacting) return { state: "sleep", tool: null }
    if (this.error) return { state: this.error.state, tool: null }
    if (this.reaction) return { state: this.reaction.state, tool: null }
    const tool = this.pickTool()

    if (tool) return { state: tool.kind, tool }
    return { state: this.activity, tool: null }
  }

  private apply(event: EyeEvent, now: number) {
    if (event.type !== "window.visible" && event.type !== "context.usage") {
      this.lastEventAt = now
      this.seen = true
    }

    switch (event.type) {
      case "execution.started":
      case "reasoning.started":
        this.activity = "think"
        break
      case "step.started":
        this.activity = "think"
        if (this.error?.state === "error" && this.error.clearOn === "step") this.error = null
        break
      case "text.started":
        this.activity = "respond"
        break

      case "tool.input.started": {
        const name = event.innerTool ?? event.tool

        this.tools.set(event.callId, { callId: event.callId, name, kind: classifyTool(name), since: now })
        break
      }
      case "tool.called": {
        const existing = this.tools.get(event.callId)

        if (!existing) {
          // The eye missed the start: a generic tool, with its name as the label.
          this.tools.set(event.callId, {
            callId: event.callId,
            name: event.innerTool ?? event.tool,
            kind: "generic",
            since: now,
          })
        } else if (event.innerTool && event.innerTool !== existing.name) {
          // execute: the inner tool's name may only arrive here.
          this.tools.set(event.callId, { ...existing, name: event.innerTool, kind: classifyTool(event.innerTool) })
        }
        break
      }
      case "tool.success":
        this.tools.delete(event.callId)
        if (!this.tools.size) this.activity = "think"
        break
      case "tool.failed":
        this.tools.delete(event.callId)
        if (event.aborted) this.react("vexed", now)
        else if (!this.error || this.error.state === "error-flash")
          this.error = { state: "error-flash", until: now + this.o.flashMs }
        if (!this.tools.size) this.activity = "think"
        break

      case "permission.asked":
      case "form.created":
        this.waits.add(event.id)
        break
      case "permission.replied":
        this.waits.delete(event.id)
        if (event.rejected) this.react("vexed", now)
        break
      case "form.replied":
      case "form.cancelled":
        this.waits.delete(event.id)
        break

      case "compaction.started":
        this.compacting = true
        if (this.error?.state === "error" && this.error.clearOn === "compaction-or-prompt") this.error = null
        break
      case "compaction.ended":
        this.compacting = false
        break
      case "compaction.failed":
        this.compacting = false
        if (event.aborted) this.react("vexed", now)
        else this.error = { state: "error", clearOn: "compaction-or-prompt" }
        break

      case "step.failed":
        if (event.aborted) this.react("vexed", now)
        else if (this.error?.state !== "error-spiral") this.error = { state: "error", clearOn: "step" }
        break
      case "execution.failed":
        this.tools.clear()
        this.waits.clear()
        this.activity = "idle"
        if (event.aborted) this.react("vexed", now)
        else this.error = { state: "error-spiral", clearOn: "prompt" }
        break
      case "execution.succeeded":
        this.tools.clear()
        this.waits.clear()
        this.activity = "idle"
        this.react("happy", now)
        break
      case "execution.interrupted":
        this.tools.clear()
        this.waits.clear()
        this.activity = "idle"
        this.react("vexed", now)
        break

      case "prompt.sent":
        if (
          this.error &&
          this.error.state !== "error-flash" &&
          (this.error.clearOn === "prompt" || this.error.clearOn === "compaction-or-prompt")
        )
          this.error = null
        break
      case "window.visible":
        if (event.awayMs >= this.o.surprisedAwayMs) this.react("surprised", now)
        break
      case "context.usage":
        this.contextRatio = event.ratio
        break
    }
  }
}

/** Whether two views show the same thing, so a tick that changes nothing re-renders nothing. */
export function sameView(a: EyeView, b: EyeView): boolean {
  return (
    a.state === b.state &&
    a.tool?.callId === b.tool?.callId &&
    a.tool?.name === b.tool?.name &&
    a.count === b.count &&
    a.since === b.since &&
    a.mods.impatient === b.mods.impatient &&
    a.mods.bored === b.mods.bored &&
    a.mods.tired === b.mods.tired &&
    a.history[0] === b.history[0]
  )
}
