/**
 * The server's events, as the state machine's (see machine.ts). Pure: the fields read here are the ones the debug
 * log showed in real captures.
 */
import type { EyeEvent } from "./machine"

/** The fields of a server event the eye reads. An `OpenCodeEvent` fits. */
export interface ServerEvent {
  readonly type: string
  readonly data?: unknown
}

/** The session an event is about, or undefined for events the eye ignores. */
export function sessionOf(event: ServerEvent): string | undefined {
  const data = record(event.data)
  const id = data.sessionID ?? record(data.form).sessionID

  return typeof id === "string" ? id : undefined
}

/** The machine's events for one server event: none for the events the eye ignores. */
export function adapt(event: ServerEvent): readonly EyeEvent[] {
  const data = record(event.data)
  // The user declined a tool or stopped the run: the failures that follow carry `error.type: "aborted"`.
  const aborted = record(data.error).type === "aborted"
  const id = string(data.id)

  switch (event.type) {
    // A run starts with each prompt: the errors that last until the next one end here.
    case "session.execution.started":
      return [{ type: "prompt.sent" }, { type: "execution.started" }]
    case "session.step.started":
      return [{ type: "step.started" }]
    case "session.reasoning.started":
      return [{ type: "reasoning.started" }]
    case "session.text.started":
      return [{ type: "text.started" }]

    // The only event that names the tool.
    case "session.tool.input.started":
      return id ? [{ type: "tool.input.started", callId: id, tool: string(data.name) ?? "" }] : []
    case "session.tool.called":
      return id ? [{ type: "tool.called", callId: id, tool: string(data.name) ?? "" }] : []
    // A wrapper such as `execute` reports the tools it calls.
    case "session.tool.progress": {
      const inner = innerTool(record(data.metadata).toolCalls)

      return id && inner ? [{ type: "tool.called", callId: id, tool: "execute", innerTool: inner }] : []
    }
    case "session.tool.success":
      return id ? [{ type: "tool.success", callId: id }] : []
    case "session.tool.failed":
      return id ? [{ type: "tool.failed", callId: id, aborted }] : []

    case "permission.asked":
      return id ? [{ type: "permission.asked", id }] : []
    case "permission.replied": {
      const request = string(data.requestID)

      return request ? [{ type: "permission.replied", id: request, rejected: data.reply === "reject" }] : []
    }
    case "form.created": {
      const form = string(record(data.form).id)

      return form ? [{ type: "form.created", id: form }] : []
    }
    case "form.replied":
    case "form.cancelled":
      return id ? [{ type: event.type, id }] : []

    case "session.compaction.started":
      return [{ type: "compaction.started" }]
    case "session.compaction.ended":
      return [{ type: "compaction.ended" }]
    case "session.compaction.failed":
      return [{ type: "compaction.failed", aborted }]

    case "session.step.failed":
      return [{ type: "step.failed", aborted }]
    case "session.execution.failed":
      return [{ type: "execution.failed", aborted }]
    case "session.execution.succeeded":
      return [{ type: "execution.succeeded" }]
    case "session.execution.interrupted":
      return [{ type: "execution.interrupted" }]

    default:
      return []
  }
}

/** The tokens a step put in the model's context, and the assistant message it belongs to. */
export function stepUsage(event: ServerEvent): { readonly messageID: string; readonly tokens: number } | undefined {
  if (event.type !== "session.step.ended") return undefined
  const data = record(event.data)
  const messageID = string(data.assistantMessageID)
  const tokens = contextTokens(data.tokens)

  return messageID && tokens ? { messageID, tokens } : undefined
}

/** All the tokens of a step's usage: what the conversation weighs in the context once it ends. */
export function contextTokens(usage: unknown): number | undefined {
  const tokens = record(usage)
  const cache = record(tokens.cache)
  const total = [tokens.input, tokens.output, tokens.reasoning, cache.read, cache.write].reduce<number>(
    (sum, value) => sum + (typeof value === "number" && Number.isFinite(value) ? value : 0),
    0,
  )

  return total > 0 ? total : undefined
}

function innerTool(calls: unknown): string | undefined {
  if (!Array.isArray(calls) || calls.length === 0) return undefined
  const running = calls.findLast((call) => record(call).status === "running") ?? calls.at(-1)

  return string(record(running).tool)
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {}
}

function string(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined
}
