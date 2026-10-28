import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js"
import { createKeyed, usePlugin } from "@opencode/plugin/gui"
import type { definition } from "./definition"
import { Eye } from "./eye"
import { GALLERY, modsOf, NO_MODS, type GalleryItem } from "./gallery"
import { pickIcon } from "./icon-picker"
import { isIconName, toolIcon } from "./icons"
import { stateLabel } from "./labels"
import { clampSize, COLORS, computedHex, eyeSize, resolveColors, SIZE, STROKES, TOKENS } from "./palette"
import { createReducedMotion } from "./reduced"

/** The search entries of the settings page; each row carries its id so search can reveal it. */
export const ENTRIES = ["size", "look", "colors", "motion", "states", "mcp", "debug"] as const

// The preview at the automatic size, as in a panel of this width.
const PREVIEW_ROOM = 280

/** The eye's settings page. `target` is the search entry to reveal. */
export function EyeSettings(props: { readonly target?: string }) {
  const ctx = usePlugin<typeof definition>()
  const ui = ctx.ui
  const settings = () => ctx.stores.eye.value
  const update = ctx.stores.eye.update
  const reduced = createReducedMotion(() => settings().reduced)
  const [root, setRoot] = createSignal<HTMLDivElement>()
  // A color input takes #rrggbb: show the user's color, else what the theme's computes to under the preview.
  const shown = (key: (typeof COLORS)[number]) => {
    // Computed again when the theme changes.
    void ctx.appearance.mode()
    const eye = root()?.querySelector(".opencode-eye-root")

    return settings()[key] || (eye && computedHex(TOKENS[key], eye)) || "#888888"
  }
  const auto = () => settings().size === SIZE.auto

  // Search reveals an entry: bring its row into view.
  createKeyed(
    () => props.target,
    (target) =>
      queueMicrotask(() => root()?.querySelector(`[data-entry="${target}"]`)?.scrollIntoView({ block: "center" })),
  )

  return (
    <div ref={setRoot} class="opencode-eye-settings">
      <div class="opencode-eye-settings__preview">
        <Eye
          state="idle"
          tool={false}
          mods={NO_MODS}
          size={eyeSize(settings().size, PREVIEW_ROOM)}
          theme={ctx.appearance.mode()}
          brow={settings().brow}
          stroke={settings().stroke}
          colors={resolveColors(settings())}
          reduced={reduced()}
          visible={() => true}
        />
      </div>

      <section data-entry="size">
        <h3>{ctx.t("settings.size")}</h3>
        <ui.Switch
          label={ctx.t("settings.size.auto")}
          checked={auto()}
          onChange={(checked) =>
            update((draft) => {
              draft.size = checked ? SIZE.auto : eyeSize(SIZE.auto, PREVIEW_ROOM)
            })
          }
        />
        <Show when={!auto()}>
          <label class="opencode-eye-settings__row">
            <input
              type="range"
              min={SIZE.min}
              max={SIZE.max}
              step={SIZE.step}
              value={settings().size}
              aria-label={ctx.t("settings.size")}
              onInput={(event) => {
                const size = clampSize(event.currentTarget.valueAsNumber)

                update((draft) => {
                  draft.size = size
                })
              }}
            />
            <span class="opencode-eye-settings__value">{settings().size} px</span>
          </label>
        </Show>
      </section>

      <section data-entry="look">
        <h3>{ctx.t("settings.look")}</h3>
        <ui.Switch
          label={ctx.t("settings.brow")}
          checked={settings().brow}
          onChange={(checked) =>
            update((draft) => {
              draft.brow = checked
            })
          }
        />
        <div class="opencode-eye-settings__row" role="group" aria-label={ctx.t("settings.stroke")}>
          <span>{ctx.t("settings.stroke")}</span>
          <For each={STROKES}>
            {(stroke) => (
              <ui.Button
                size="small"
                variant={settings().stroke === stroke ? "contrast" : "neutral"}
                onClick={() =>
                  update((draft) => {
                    draft.stroke = stroke
                  })
                }
              >
                {ctx.t(`settings.stroke.${stroke}`)}
              </ui.Button>
            )}
          </For>
        </div>
      </section>

      <section data-entry="colors">
        <h3>{ctx.t("settings.colors")}</h3>
        <p class="opencode-eye-settings__hint">{ctx.t("settings.colors.hint")}</p>
        <For each={COLORS}>
          {(key) => (
            <div class="opencode-eye-settings__row">
              <input
                type="color"
                value={shown(key)}
                aria-label={ctx.t(`settings.color.${key}`)}
                onInput={(event) => {
                  const color = event.currentTarget.value

                  update((draft) => {
                    draft[key] = color
                  })
                }}
              />
              <span>{ctx.t(`settings.color.${key}`)}</span>
              <Show
                when={settings()[key]}
                fallback={<span class="opencode-eye-settings__hint">{ctx.t("settings.color.theme")}</span>}
              >
                <ui.Button
                  size="small"
                  variant="ghost"
                  icon="reset"
                  onClick={() =>
                    update((draft) => {
                      draft[key] = ""
                    })
                  }
                >
                  {ctx.t("settings.color.reset")}
                </ui.Button>
              </Show>
            </div>
          )}
        </For>
      </section>

      <section data-entry="motion">
        <h3>{ctx.t("settings.motion")}</h3>
        <ui.Switch
          label={ctx.t("settings.reduced")}
          description={ctx.t("settings.reduced.description")}
          checked={settings().reduced}
          onChange={(checked) =>
            update((draft) => {
              draft.reduced = checked
            })
          }
        />
      </section>

      <StateGallery reduced={reduced()} />

      <McpIcons />

      <section data-entry="debug">
        <ui.Switch
          label={ctx.t("debug.switch")}
          description={ctx.t("debug.description")}
          checked={ctx.stores.debug.value.enabled}
          onChange={(checked) =>
            ctx.stores.debug.update((draft) => {
              draft.enabled = checked
            })
          }
        />
      </section>
    </div>
  )
}

/** The MCP servers of the routed session's location (else the default one), and those that already have an icon. */
function McpIcons() {
  const ctx = usePlugin<typeof definition>()
  const ui = ctx.ui
  const data = () => ctx.servers.get("sidecar")?.data
  const ref = () => ctx.sessions.current()?.location ?? data()?.location.default()
  const icons = () => ctx.stores.mcp.value.icons

  // The list loads on demand: ask for it whenever the server or the location changes.
  createKeyed(
    () => {
      const source = data()
      const location = ref()

      return source && location ? { source, location } : undefined
    },
    ({ source, location }) =>
      void source.location.mcp.server
        .sync(location)
        .catch((error: unknown) => console.warn(`[${ctx.id}] could not load the MCP servers`, error)),
    { equals: (a, b) => a.source === b.source && a.location.directory === b.location.directory },
  )

  const servers = createMemo(() => {
    const listed = data()?.location.mcp.server.list(ref()) ?? []
    const rows = new Map(listed.map((server) => [server.name, server.title ?? server.name]))

    for (const name of Object.keys(icons())) if (!rows.has(name)) rows.set(name, name)
    return [...rows].toSorted(([a], [b]) => a.localeCompare(b)).map(([name, title]) => ({ name, title }))
  })

  const choose = async (name: string) => {
    const chosen = icons()[name]
    const icon = await pickIcon(ctx, {
      title: ctx.t("settings.mcp.pick", { server: name }),
      current: chosen && isIconName(chosen) ? chosen : undefined,
    })

    if (icon)
      ctx.stores.mcp.update((draft) => {
        draft.icons[name] = icon
      })
  }

  return (
    <section data-entry="mcp">
      <h3>{ctx.t("settings.mcp")}</h3>
      <p class="opencode-eye-settings__hint">{ctx.t("settings.mcp.hint")}</p>
      <For each={servers()} fallback={<p class="opencode-eye-settings__hint">{ctx.t("settings.mcp.none")}</p>}>
        {(server) => {
          const chosen = () => {
            const icon = icons()[server.name]

            return icon && isIconName(icon) ? icon : undefined
          }

          return (
            <div class="opencode-eye-settings__row">
              <ui.IconButton
                icon={chosen() ?? "mcp"}
                label={ctx.t("settings.mcp.pick", { server: server.name })}
                onClick={() => void choose(server.name)}
              />
              <span>{server.title}</span>
              <Show when={server.title !== server.name}>
                <code class="opencode-eye-settings__hint">{server.name}</code>
              </Show>
              <Show when={chosen()}>
                <ui.Button
                  size="small"
                  variant="ghost"
                  icon="reset"
                  onClick={() =>
                    ctx.stores.mcp.update((draft) => {
                      delete draft.icons[server.name]
                    })
                  }
                >
                  {ctx.t("settings.mcp.reset")}
                </ui.Button>
              </Show>
            </div>
          )
        }}
      </For>
    </section>
  )
}

// Above the size where the scene hides: the props are the point of the gallery.
const GALLERY_SIZE = 128

/** Every state and modifier of the eye, in the user's drawing and colors. */
function StateGallery(props: { readonly reduced: boolean }) {
  const ctx = usePlugin<typeof definition>()

  return (
    <section data-entry="states">
      <h3>{ctx.t("settings.states")}</h3>
      <p class="opencode-eye-settings__hint">{ctx.t("settings.states.hint")}</p>
      <ul class="opencode-eye-states">
        <For each={GALLERY}>{(item) => <StateCard item={item} reduced={props.reduced} />}</For>
      </ul>
    </section>
  )
}

function StateCard(props: { readonly item: GalleryItem; readonly reduced: boolean }) {
  const ctx = usePlugin<typeof definition>()
  const settings = () => ctx.stores.eye.value
  const [shown, setShown] = createSignal(false)
  let card: HTMLLIElement | undefined

  // 21 frame loops are cheap, but only the cards on screen run theirs.
  onMount(() => {
    if (!card || typeof IntersectionObserver !== "function") return setShown(true)
    const observer = new IntersectionObserver(([entry]) => setShown(!!entry?.isIntersecting))

    observer.observe(card)
    onCleanup(() => observer.disconnect())
  })

  return (
    <li ref={card} class="opencode-eye-states__card">
      <Eye
        state={props.item.state}
        tool={!!props.item.tool}
        mods={modsOf(props.item)}
        size={GALLERY_SIZE}
        theme={ctx.appearance.mode()}
        brow={settings().brow}
        stroke={settings().stroke}
        colors={resolveColors(settings())}
        reduced={props.reduced}
        visible={shown}
        badge={
          <Show when={props.item.tool}>
            {(tool) => (
              <div class="eye-badge">
                <ctx.ui.Icon name={toolIcon(tool(), ctx.stores.mcp.value.icons)} size="small" />
              </div>
            )}
          </Show>
        }
      />
      <strong>{props.item.mod ? ctx.t(`mod.${props.item.mod}`) : stateLabel(ctx.t, props.item.state)}</strong>
      <code>{props.item.mod ? `${props.item.state} + ${props.item.mod}` : props.item.state}</code>
      <span class="opencode-eye-settings__hint">{ctx.t(`states.${props.item.key}`)}</span>
    </li>
  )
}
