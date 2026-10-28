import { createSignal, createUniqueId, For, onCleanup, onMount, Show } from "solid-js"
import { usePlugin } from "@opencode/plugin/gui"
import type { definition } from "./definition"
import { formatDuration, transitionLabel } from "./labels"
import type { EyeView } from "./machine"

/**
 * The details card the eye opens: the tool in flight, how long the state has lasted (each second), the latest
 * transitions. Informative only. Escape and × close it; the panel puts the focus back on the eye.
 */
export function DetailsCard(props: { readonly view: EyeView; readonly onClose: () => void }) {
  const ctx = usePlugin<typeof definition>()
  const title = createUniqueId()
  const [now, setNow] = createSignal(Date.now())
  const timer = setInterval(() => setNow(Date.now()), 1000)
  const time = new Intl.DateTimeFormat(ctx.locale.locale(), { hour: "2-digit", minute: "2-digit", second: "2-digit" })
  let card: HTMLElement | undefined

  onCleanup(() => clearInterval(timer))
  // The focus moves into the card, so Escape and the screen reader start there.
  onMount(() => card?.focus())

  return (
    <section
      ref={card}
      class="opencode-eye-card"
      role="dialog"
      aria-labelledby={title}
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return
        event.stopPropagation()
        props.onClose()
      }}
    >
      <h2 id={title}>{ctx.t("card.title")}</h2>
      <span class="opencode-eye-card__close">
        <ctx.ui.IconButton icon="close-small" label={ctx.t("card.close")} onClick={() => props.onClose()} />
      </span>
      <dl>
        <dt>{ctx.t("card.tool")}</dt>
        <dd>
          <Show when={props.view.tool} fallback={ctx.t("card.tool.none")}>
            {(tool) => (
              <>
                <code>{tool().name || "…"}</code>
                <Show when={props.view.count > 1}> · {ctx.t("card.tools", { count: props.view.count })}</Show>
              </>
            )}
          </Show>
        </dd>
        <dt>{ctx.t("card.since")}</dt>
        <dd>{formatDuration(now() - props.view.since)}</dd>
      </dl>
      <h3>{ctx.t("card.history")}</h3>
      <ol>
        <For each={props.view.history} fallback={<li>{ctx.t("card.history.empty")}</li>}>
          {(item) => (
            <li>
              <span class="opencode-eye-card__time">{time.format(item.at)}</span>
              <span>{transitionLabel(ctx.t, item)}</span>
              <code>{item.event}</code>
            </li>
          )}
        </For>
      </ol>
    </section>
  )
}
