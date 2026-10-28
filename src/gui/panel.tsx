import { createMemo, createSignal, For, onCleanup, Show } from "solid-js"
import { createKeyed, usePanel, usePlugin, type MountedSession } from "@opencode/plugin/gui"
import { DetailsCard } from "./card"
import type { EventLog } from "./debug"
import type { definition } from "./definition"
import type { Engine } from "./engine"
import { Eye } from "./eye"
import { toolIcon } from "./icons"
import { announced, statusDot, viewLabel } from "./labels"
import { eyeSize, resolveColors } from "./palette"
import { createReducedMotion, createWidth } from "./reduced"
import type { Eyes } from "./window"

// How often time passes for the eye on screen: the 400 ms per state, the 250 ms before thinking, the reactions.
const TICK_MS = 100
// The click blinks twice, then the card opens.
const OPEN_MS = 380

export function EyePanel(props: { readonly session: MountedSession; readonly eyes: Eyes; readonly log: EventLog }) {
  const ctx = usePlugin<typeof definition>()
  const panel = usePanel()
  const settings = () => ctx.stores.eye.value
  // Read through the getter each time: the panel stays mounted when the user switches sessions.
  const view = () => props.eyes.view(props.session.id)
  const label = () => viewLabel(ctx.t, view())
  const reduced = createReducedMotion(() => settings().reduced)
  const [open, setOpen] = createSignal(false)
  let stage: HTMLDivElement | undefined
  let opening: ReturnType<typeof setTimeout> | undefined
  const room = createWidth(() => stage)

  // Each session the panel shows, including after a switch; the card belongs to the session it opened on.
  createKeyed(
    () => props.session.id,
    (id) => {
      props.eyes.ensure(id)
      setOpen(false)
    },
  )
  // Time passes only while the eye is on screen.
  createKeyed(
    () => panel.visible() && props.session.id,
    (id) => {
      const timer = setInterval(() => props.eyes.tick(id), TICK_MS)

      onCleanup(() => clearInterval(timer))
    },
  )
  onCleanup(() => clearTimeout(opening))

  const close = () => {
    setOpen(false)
    stage?.querySelector<HTMLButtonElement>("button.eye-btn")?.focus()
  }
  const toggle = (engine: Engine) => {
    clearTimeout(opening)
    if (open()) return close()
    engine.blinkTwice()
    opening = setTimeout(() => setOpen(true), reduced() ? 0 : OPEN_MS)
  }

  return (
    <div class="opencode-eye" data-session={props.session.id}>
      <div ref={stage} class="opencode-eye__stage">
        <Eye
          state={view().state}
          tool={!!view().tool}
          mods={view().mods}
          size={eyeSize(settings().size, room())}
          theme={ctx.appearance.mode()}
          brow={settings().brow}
          stroke={settings().stroke}
          colors={resolveColors(settings())}
          reduced={reduced()}
          visible={panel.visible}
          label={ctx.t("eye.label")}
          onClick={toggle}
          badge={
            <Show when={view().tool}>
              {(tool) => (
                <div class="eye-badge">
                  <ctx.ui.Icon name={toolIcon(tool().name, ctx.stores.mcp.value.icons)} size="small" />
                  <span>{tool().name || ctx.t(`state.${view().state}`)}</span>
                  <Show when={view().count > 1}>
                    <span class="count">×{view().count}</span>
                  </Show>
                </div>
              )}
            </Show>
          }
        >
          <div class="eye-status">
            <span class={`dot ${statusDot(view().state)}`} />
            <span>{label()}</span>
          </div>
          {/* A screen reader hears attention, the errors and the end of a run, not every tool. */}
          <div class="opencode-eye__sr" aria-live="polite">
            {announced(view().state) ? label() : ""}
          </div>
          <Show when={open()}>
            <DetailsCard view={view()} onClose={close} />
          </Show>
        </Eye>
      </div>
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
    <details class="opencode-eye-debug" open={enabled()}>
      <summary>{ctx.t("debug.title")}</summary>
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
    </details>
  )
}
