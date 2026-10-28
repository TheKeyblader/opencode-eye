import { createMemo, createSignal, For, Show } from "solid-js"
import { usePlugin, type MountedSession } from "@opencode/plugin/gui"
import type { EventLog } from "./debug"
import type { definition } from "./definition"

export function EyePanel(props: { readonly session: MountedSession; readonly log: EventLog }) {
  const ctx = usePlugin<typeof definition>()

  return (
    <div class="opencode-eye" data-session={props.session.id}>
      <p class="opencode-eye__empty">{ctx.t("panel.empty")}</p>
      <DebugLog session={props.session} log={props.log} />
    </div>
  )
}

function DebugLog(props: { readonly session: MountedSession; readonly log: EventLog }) {
  const ctx = usePlugin<typeof definition>()
  const ui = ctx.ui
  const [onlySession, setOnlySession] = createSignal(false)
  const enabled = () => ctx.stores.debug.value.enabled

  const entries = createMemo(() => {
    const all = props.log.entries
    const list = onlySession() ? all.filter((entry) => entry.session === props.session.id) : all

    return list.slice(-100).reverse()
  })
  const types = createMemo(() =>
    Object.entries(props.log.counts).sort(([a], [b]) => a.localeCompare(b)),
  )
  const dump = () => props.log.serialize({ app: ctx.app.version, platform: ctx.app.platform, session: props.session.id })

  return (
    <section class="opencode-eye-debug">
      <ui.Switch
        label={ctx.t("debug.switch")}
        description={ctx.t("debug.description")}
        checked={enabled()}
        onChange={(checked) =>
          ctx.stores.debug.update((draft) => {
            draft.enabled = checked
          })
        }
      />
      <Show when={enabled()}>
        <div class="opencode-eye-debug__bar">
          <ui.Switch label={ctx.t("debug.session")} checked={onlySession()} onChange={setOnlySession} />
          <ui.Button
            size="small"
            variant="ghost"
            icon="copy"
            onClick={() =>
              void ctx.system.copy(dump()).then(() => ctx.toast.show({ variant: "success", title: ctx.t("debug.copied") }))
            }
          >
            {ctx.t("debug.copy")}
          </ui.Button>
          <ui.Button
            size="small"
            variant="ghost"
            icon="download"
            onClick={() => void ctx.system.save({ name: "opencode-eye-events.json", content: dump() })}
          >
            {ctx.t("debug.save")}
          </ui.Button>
          <ui.Button size="small" variant="ghost" icon="trash" onClick={() => props.log.clear()}>
            {ctx.t("debug.clear")}
          </ui.Button>
        </div>
        <Show when={types().length > 0}>
          <details class="opencode-eye-debug__types">
            <summary>
              {ctx.t("debug.types")} ({types().length})
            </summary>
            <ul>
              <For each={types()}>
                {([name, count]) => (
                  <li>
                    <code>{name}</code> × {count}
                  </li>
                )}
              </For>
            </ul>
          </details>
        </Show>
        <ol class="opencode-eye-debug__list">
          <For each={entries()} fallback={<li class="opencode-eye__empty">{ctx.t("debug.empty")}</li>}>
            {(entry) => (
              <li classList={{ "opencode-eye-debug__other": !!entry.session && entry.session !== props.session.id }}>
                <details>
                  <summary>
                    <span class="opencode-eye-debug__seq">#{entry.seq}</span> <code>{entry.name}</code>
                  </summary>
                  <pre>{JSON.stringify(entry.details, null, 2)}</pre>
                </details>
              </li>
            )}
          </For>
        </ol>
      </Show>
    </section>
  )
}
