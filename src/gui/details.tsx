import { createSignal, For, onCleanup, Show } from "solid-js"
import type { Context } from "@opencode/plugin/gui"
import { runningIcon, toolIcon } from "./icons"
import { formatDuration, stateLabel, toolName, transitionLabel } from "./labels"
import type { EyeState } from "./state"

/**
 * Opens the details of one session's eye: what it shows now, for how long, and its latest transitions. The dialog
 * follows the session it was opened for, whatever the user routes to next.
 */
export function openDetails(ctx: Context, state: () => EyeState) {
  ctx.dialogs.open((dialog) => <Details ctx={ctx} state={state} close={dialog.close} />)
}

function Details(props: { readonly ctx: Context; readonly state: () => EyeState; readonly close: () => void }) {
  const ctx = props.ctx
  const ui = ctx.ui
  const [now, setNow] = createSignal(Date.now())
  const timer = setInterval(() => setNow(Date.now()), 1000)

  onCleanup(() => clearInterval(timer))

  const since = (at: number) => formatDuration(now() - at)
  const time = (at: number) =>
    new Date(at).toLocaleTimeString(ctx.locale.locale(), { hour: "2-digit", minute: "2-digit", second: "2-digit" })
  // Newest first, each with how long it lasted.
  const history = () => {
    const items = props.state().history

    return items.map((item, index) => ({ item, until: items[index + 1]?.at ?? now() })).reverse()
  }

  return (
    <ui.Dialog
      title={ctx.t("details.title")}
      description={stateLabel(ctx.t, props.state())}
      size="normal"
      footer={
        <ui.Button variant="contrast" onClick={props.close}>
          {ctx.t("details.close")}
        </ui.Button>
      }
    >
      <div class="opencode-eye-details">
        <section>
          <h3>{ctx.t("details.now")}</h3>
          <p>{ctx.t("details.since", { duration: since(props.state().since) })}</p>
          <Show when={props.state().running && props.state().started}>
            {(started) => <p>{ctx.t("details.execution", { duration: since(started()) })}</p>}
          </Show>
        </section>

        <Show when={props.state().tools.length > 0}>
          <section>
            <h3>{ctx.t("details.tools")}</h3>
            <ul>
              <For each={[...props.state().tools].reverse()}>
                {(tool) => (
                  <li>
                    <ui.Icon name={runningIcon(tool)} size="small" />
                    <code>{toolName(tool) || "?"}</code>
                    <span class="opencode-eye-details__muted">{since(tool.since)}</span>
                  </li>
                )}
              </For>
            </ul>
          </section>
        </Show>

        <Show when={props.state().asks.length > 0}>
          <section>
            <h3>{ctx.t("details.asks")}</h3>
            <ul>
              <For each={props.state().asks}>
                {(ask) => (
                  <li>
                    <ui.Icon name={ask.kind === "permission" ? "shield" : "speech-bubble"} size="small" />
                    <span>{ctx.t(`details.ask.${ask.kind}`)}</span>
                    <Show when={ask.label}>
                      <code>{ask.label}</code>
                    </Show>
                    <span class="opencode-eye-details__muted">{since(ask.since)}</span>
                  </li>
                )}
              </For>
            </ul>
          </section>
        </Show>

        <Show when={props.state().mood === "error" && props.state().error}>
          {(error) => (
            <section>
              <h3>{ctx.t("details.error")}</h3>
              <p class="opencode-eye-details__error" style={{ "font-family": ctx.appearance.font("mono") }}>{error().message || ctx.t(`details.error.${error().scope}`)}</p>
            </section>
          )}
        </Show>

        <section>
          <h3>{ctx.t("details.history")}</h3>
          <ol class="opencode-eye-details__history">
            <For each={history()} fallback={<li class="opencode-eye-details__muted">{ctx.t("details.history.empty")}</li>}>
              {({ item, until }) => (
                <li>
                  <span class="opencode-eye-details__muted">{time(item.at)}</span>
                  <Show when={item.tool !== undefined}>
                    <ui.Icon name={toolIcon(item.tool ?? "")} size="small" />
                  </Show>
                  <span>{transitionLabel(ctx.t, item)}</span>
                  <span class="opencode-eye-details__muted">{formatDuration(until - item.at)}</span>
                </li>
              )}
            </For>
          </ol>
        </section>
      </div>
    </ui.Dialog>
  )
}
