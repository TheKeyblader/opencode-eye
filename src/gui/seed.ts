/**
 * What the server already knows about a session, for an eye that joins it mid-run: after the plugin loads, a window
 * opens, or a rebuild reloads the GUI. Pure: it reads plain values, so the window passes in what `Data` holds.
 */

import { contextTokens } from "./adapt"

/**
 * The structural parts of the server's data the seed reads. `Data`'s values fit. A list the server has not loaded yet,
 * such as an old session's pending approvals, is undefined at runtime whatever `Data`'s types say: it counts as empty.
 */
export interface SeedSource {
  readonly status: "idle" | "running"
  readonly messages?: readonly unknown[]
  readonly permissions?: readonly { readonly id: string; readonly action: string }[]
  readonly forms?: readonly { readonly id: string; readonly title: string }[]
}

/** What an eye joining mid-run starts from: a `Snapshot` for the machine, and the latest context usage. */
export interface Seed {
  readonly sessionID: string
  readonly running: boolean
  readonly compacting: boolean
  readonly tools: readonly { readonly id: string; readonly name: string }[]
  readonly asks: readonly { readonly id: string; readonly kind: "permission" | "question"; readonly label?: string }[]
  /** What the latest answer put in the context, for the context usage. */
  readonly usage?: { readonly messageID: string; readonly tokens: number }
}

// A tool part streams its input, then runs; `completed` and `error` are done.
const IN_FLIGHT = new Set(["streaming", "running"])

/** What the server's data says about a session: whether it runs, its tools in flight, what waits for the user. */
export function seed(sessionID: string, source: SeedSource): Seed {
  const running = source.status === "running"
  const messages = source.messages ?? []
  const tools: { id: string; name: string }[] = []
  let compacting = false
  let usage: Seed["usage"]

  for (const message of messages) {
    const item = record(message)
    const tokens = item.type === "assistant" ? contextTokens(item.tokens) : undefined

    if (tokens && typeof item.id === "string") usage = { messageID: item.id, tokens }
  }

  // A part left "running" by a run that is over is stale: trust the parts only while the session runs.
  if (running) {
    for (const message of messages) {
      const item = record(message)

      if (item.type === "compaction") compacting = item.status === "running"
      if (item.type !== "assistant" || !Array.isArray(item.content)) continue
      for (const part of item.content) {
        const tool = record(part)

        if (tool.type !== "tool" || typeof tool.id !== "string") continue
        if (IN_FLIGHT.has(String(record(tool.state).status)))
          tools.push({ id: tool.id, name: typeof tool.name === "string" ? tool.name : "" })
      }
    }
  }

  return {
    sessionID,
    running,
    compacting,
    tools,
    asks: [
      ...(source.permissions ?? []).map((item) => ({ id: item.id, kind: "permission" as const, label: item.action })),
      ...(source.forms ?? []).map((item) => ({ id: item.id, kind: "question" as const, label: item.title })),
    ],
    usage,
  }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {}
}
