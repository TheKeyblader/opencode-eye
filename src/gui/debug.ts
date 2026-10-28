import { createStore, produce } from "solid-js/store"

/** One server event as captured by the debug log, with its payload trimmed to something pasteable. */
export interface LoggedEvent {
  readonly seq: number
  readonly time: number
  readonly name: string
  readonly session: string | undefined
  readonly details: unknown
}

const MAX_ENTRIES = 1000
// Streaming events arrive by the hundred per message: keep a few samples, count the rest.
const DELTA_SAMPLES = 3
const MAX_STRING = 400
const MAX_ARRAY = 20
const MAX_DEPTH = 6

const isDelta = (name: string) => name.endsWith(".delta")

/** Copies a payload with long strings, long arrays and deep nesting cut short. */
export function trim(value: unknown, depth = 0): unknown {
  if (typeof value === "string")
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…(+${value.length - MAX_STRING} chars)` : value
  if (value === null || typeof value !== "object") return value
  if (depth >= MAX_DEPTH) return "[…]"
  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ARRAY).map((item) => trim(item, depth + 1))

    return value.length > MAX_ARRAY ? [...items, `…(+${value.length - MAX_ARRAY} items)`] : items
  }

  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, trim(item, depth + 1)]))
}

/** The session an event is about, wherever the payload keeps it. */
export function sessionOf(details: unknown): string | undefined {
  if (!details || typeof details !== "object") return undefined
  const data = (details as { data?: Record<string, unknown> }).data
  const id = data?.sessionID ?? data?.sessionId ?? (data?.session as { id?: unknown } | undefined)?.id

  return typeof id === "string" ? id : undefined
}

/** The debug log of server events: see `createEventLog`. */
export type EventLog = ReturnType<typeof createEventLog>

/**
 * A reactive log of the server's events, for the debug panel: the latest 1000, with payloads trimmed, and a count per
 * event name. Streaming deltas only keep their first few samples. Call it under an owner.
 */
export function createEventLog() {
  const [state, setState] = createStore({
    seq: 0,
    started: 0,
    entries: [] as LoggedEvent[],
    counts: {} as Record<string, number>,
  })

  return {
    get entries(): readonly LoggedEvent[] {
      return state.entries
    },
    get counts(): Readonly<Record<string, number>> {
      return state.counts
    },
    /** Records an event. Returns the entry kept, or undefined for a delta past its samples. */
    record(name: string, details: unknown): LoggedEvent | undefined {
      const count = (state.counts[name] ?? 0) + 1
      const keep = !isDelta(name) || count <= DELTA_SAMPLES
      const now = Date.now()
      const entry: LoggedEvent | undefined = keep
        ? { seq: state.seq + 1, time: now, name, session: sessionOf(details), details: trim(details) }
        : undefined

      setState(
        produce((draft) => {
          draft.counts[name] = count
          if (!draft.started) draft.started = now
          if (!entry) return
          draft.seq = entry.seq
          draft.entries.push(entry)
          if (draft.entries.length > MAX_ENTRIES) draft.entries.splice(0, draft.entries.length - MAX_ENTRIES)
        }),
      )

      return entry
    },
    /** Forgets every entry and count. */
    clear() {
      setState({ seq: 0, started: 0, entries: [], counts: {} })
    },
    /** The whole log as JSON, times relative to the first event. */
    serialize(meta: Record<string, unknown>): string {
      return JSON.stringify(
        {
          ...meta,
          counts: state.counts,
          events: state.entries.map((entry) => ({
            t: entry.time - state.started,
            name: entry.name,
            session: entry.session,
            details: entry.details,
          })),
        },
        null,
        2,
      )
    },
  }
}
